using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Reflection.Emit;
using System.Runtime.Serialization;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Web.WebView2.Core;
using Xunit;
using QuickLook.Plugin.StepViewer;

namespace QuickLook.Plugin.StepViewer.Tests
{
    /// <summary>
    /// Adversarial stress tests for SEC-05: WebView2 Sandbox, Host Objects Lockout & Popup Suppression.
    /// Empirically verifies host object lockout, unconditional popup cancellation, navigation perimeter lockdown,
    /// and concurrent null-safety.
    /// </summary>
    public class WebViewSandboxAdversarialStressTests
    {
        #region Dynamic COM Event Argument Mocks for Empirical Invocation

        private static Type s_mockWinType;
        private static Type s_mockNavType;
        private static readonly object s_mockLock = new object();

        private static Type CreateDynamicMockType(Type interfaceType, string typeName)
        {
            var ab = AppDomain.CurrentDomain.DefineDynamicAssembly(
                new AssemblyName("DynamicMockAsm_" + Guid.NewGuid().ToString("N")),
                AssemblyBuilderAccess.Run);
            var mb = ab.DefineDynamicModule("DynamicMockMod");
            var tb = mb.DefineType(typeName, TypeAttributes.Public | TypeAttributes.Class);
            tb.AddInterfaceImplementation(interfaceType);

            var uriField = tb.DefineField("_uri", typeof(string), FieldAttributes.Public);
            var stateField = tb.DefineField("_state", typeof(int), FieldAttributes.Public);

            foreach (var m in interfaceType.GetMethods())
            {
                var paramTypes = Array.ConvertAll(m.GetParameters(), p => p.ParameterType);
                var meth = tb.DefineMethod(m.Name, MethodAttributes.Public | MethodAttributes.Virtual, m.ReturnType, paramTypes);
                var il = meth.GetILGenerator();

                if (string.Equals(m.Name, "get_uri", StringComparison.OrdinalIgnoreCase))
                {
                    il.Emit(OpCodes.Ldarg_0);
                    il.Emit(OpCodes.Ldfld, uriField);
                    il.Emit(OpCodes.Ret);
                }
                else if (string.Equals(m.Name, "set_Handled", StringComparison.OrdinalIgnoreCase) ||
                         string.Equals(m.Name, "set_Cancel", StringComparison.OrdinalIgnoreCase))
                {
                    il.Emit(OpCodes.Ldarg_0);
                    il.Emit(OpCodes.Ldarg_1);
                    il.Emit(OpCodes.Stfld, stateField);
                    il.Emit(OpCodes.Ret);
                }
                else if (string.Equals(m.Name, "get_Handled", StringComparison.OrdinalIgnoreCase) ||
                         string.Equals(m.Name, "get_Cancel", StringComparison.OrdinalIgnoreCase))
                {
                    il.Emit(OpCodes.Ldarg_0);
                    il.Emit(OpCodes.Ldfld, stateField);
                    il.Emit(OpCodes.Ret);
                }
                else if (m.ReturnType == typeof(void))
                {
                    il.Emit(OpCodes.Ret);
                }
                else if (m.ReturnType == typeof(int))
                {
                    il.Emit(OpCodes.Ldc_I4_0);
                    il.Emit(OpCodes.Ret);
                }
                else if (m.ReturnType == typeof(ulong))
                {
                    il.Emit(OpCodes.Ldc_I4_0);
                    il.Emit(OpCodes.Conv_I8);
                    il.Emit(OpCodes.Ret);
                }
                else
                {
                    il.Emit(OpCodes.Ldnull);
                    il.Emit(OpCodes.Ret);
                }
            }

            return tb.CreateType();
        }

        private static CoreWebView2NewWindowRequestedEventArgs CreateNewWindowArgs(string uri, out Func<bool> isHandled)
        {
            lock (s_mockLock)
            {
                var rawInterfaceType = typeof(CoreWebView2NewWindowRequestedEventArgs).Assembly.GetType("Microsoft.Web.WebView2.Core.Raw.ICoreWebView2NewWindowRequestedEventArgs");
                if (s_mockWinType == null)
                {
                    s_mockWinType = CreateDynamicMockType(rawInterfaceType, "DynamicWinArgsMock");
                }
            }

            var mockInstance = Activator.CreateInstance(s_mockWinType);
            s_mockWinType.GetField("_uri").SetValue(mockInstance, uri);

            var args = (CoreWebView2NewWindowRequestedEventArgs)FormatterServices.GetUninitializedObject(typeof(CoreWebView2NewWindowRequestedEventArgs));
            var field = typeof(CoreWebView2NewWindowRequestedEventArgs).GetField("_nativeICoreWebView2NewWindowRequestedEventArgsValue", BindingFlags.NonPublic | BindingFlags.Instance);
            field?.SetValue(args, mockInstance);
            var rawField = typeof(CoreWebView2NewWindowRequestedEventArgs).GetField("_rawNative", BindingFlags.NonPublic | BindingFlags.Instance);
            rawField?.SetValue(args, mockInstance);

            isHandled = () => (int)s_mockWinType.GetField("_state").GetValue(mockInstance) != 0;
            return args;
        }

        private static CoreWebView2NavigationStartingEventArgs CreateNavigationStartingArgs(string uri, out Func<bool> isCancelled)
        {
            lock (s_mockLock)
            {
                var rawInterfaceType = typeof(CoreWebView2NavigationStartingEventArgs).Assembly.GetType("Microsoft.Web.WebView2.Core.Raw.ICoreWebView2NavigationStartingEventArgs");
                if (s_mockNavType == null)
                {
                    s_mockNavType = CreateDynamicMockType(rawInterfaceType, "DynamicNavArgsMock");
                }
            }

            var mockInstance = Activator.CreateInstance(s_mockNavType);
            s_mockNavType.GetField("_uri").SetValue(mockInstance, uri);

            var args = (CoreWebView2NavigationStartingEventArgs)FormatterServices.GetUninitializedObject(typeof(CoreWebView2NavigationStartingEventArgs));
            var field = typeof(CoreWebView2NavigationStartingEventArgs).GetField("_nativeICoreWebView2NavigationStartingEventArgsValue", BindingFlags.NonPublic | BindingFlags.Instance);
            field?.SetValue(args, mockInstance);
            var rawField = typeof(CoreWebView2NavigationStartingEventArgs).GetField("_rawNative", BindingFlags.NonPublic | BindingFlags.Instance);
            rawField?.SetValue(args, mockInstance);

            isCancelled = () => (int)s_mockNavType.GetField("_state").GetValue(mockInstance) != 0;
            return args;
        }

        private static object GetClosureInstance()
        {
            var cType = typeof(WebViewEnvironmentManager).GetNestedType("<>c", BindingFlags.NonPublic);
            var singletonField = cType.GetField("<>9", BindingFlags.NonPublic | BindingFlags.Static);
            return singletonField?.GetValue(null) ?? Activator.CreateInstance(cType, true);
        }

        #endregion

        #region Probe 1: Host Objects Lockout (IL & Assembly Analysis)

        [Fact]
        public void HostObjectsLockout_ConfigureWebView_ExplicitlySetsAreHostObjectsAllowedToFalse()
        {
            var configMethod = typeof(WebViewEnvironmentManager).GetMethod(
                "ConfigureWebView",
                BindingFlags.Public | BindingFlags.Static);
            Assert.NotNull(configMethod);

            var body = configMethod.GetMethodBody();
            Assert.NotNull(body);
            byte[] il = body.GetILAsByteArray();

            bool foundLockoutAssignment = false;
            var module = typeof(WebViewEnvironmentManager).Module;

            for (int i = 0; i < il.Length - 5; i++)
            {
                byte op = il[i];
                if (op == 0x28 || op == 0x6f)
                {
                    int token = BitConverter.ToInt32(il, i + 1);
                    try
                    {
                        var method = module.ResolveMethod(token);
                        if (method != null && method.Name == "set_AreHostObjectsAllowed")
                        {
                            byte precedingOp = il[i - 1];
                            Assert.True(precedingOp == 0x16, $"set_AreHostObjectsAllowed must be called with false (0x16 ldc.i4.0). Found: 0x{precedingOp:X2}");
                            foundLockoutAssignment = true;
                            break;
                        }
                    }
                    catch { }
                }
            }

            Assert.True(foundLockoutAssignment, "ConfigureWebView must call set_AreHostObjectsAllowed(false).");
        }

        [Fact]
        public void HostObjectsLockout_NoMethodInAssemblyEverEnablesHostObjects()
        {
            var asm = typeof(WebViewEnvironmentManager).Assembly;
            var allTypes = asm.GetTypes();

            foreach (var type in allTypes)
            {
                var methods = type.GetMethods(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static);
                foreach (var method in methods)
                {
                    var body = method.GetMethodBody();
                    if (body == null) continue;

                    byte[] il = body.GetILAsByteArray();
                    for (int i = 0; i < il.Length - 5; i++)
                    {
                        byte op = il[i];
                        if (op == 0x28 || op == 0x6f)
                        {
                            int token = BitConverter.ToInt32(il, i + 1);
                            try
                            {
                                var callee = type.Module.ResolveMethod(token);
                                if (callee != null && callee.Name == "set_AreHostObjectsAllowed")
                                {
                                    byte precedingOp = il[i - 1];
                                    Assert.False(precedingOp == 0x17, // ldc.i4.1
                                        $"Forbidden call: {type.FullName}::{method.Name} calls set_AreHostObjectsAllowed(true)!");
                                }
                            }
                            catch { }
                        }
                    }
                }
            }
        }

        #endregion

        #region Probe 2: Unconditional Popup Suppression

        [Fact]
        public void PopupSuppression_HandlerBytecodeIsUnconditional()
        {
            var cType = typeof(WebViewEnvironmentManager).GetNestedType("<>c", BindingFlags.NonPublic);
            Assert.NotNull(cType);

            MethodInfo popupHandler = null;
            foreach (var m in cType.GetMethods(BindingFlags.NonPublic | BindingFlags.Instance))
            {
                var parameters = m.GetParameters();
                if (parameters.Length == 2 && parameters[1].ParameterType == typeof(CoreWebView2NewWindowRequestedEventArgs))
                {
                    popupHandler = m;
                    break;
                }
            }
            Assert.NotNull(popupHandler);

            var body = popupHandler.GetMethodBody();
            Assert.NotNull(body);
            byte[] il = body.GetILAsByteArray();

            bool foundSetHandled = false;
            int setHandledOffset = -1;
            var module = cType.Module;

            for (int i = 0; i < il.Length - 5; i++)
            {
                byte op = il[i];
                if (op == 0x28 || op == 0x6f)
                {
                    int token = BitConverter.ToInt32(il, i + 1);
                    try
                    {
                        var method = module.ResolveMethod(token);
                        if (method != null && method.Name == "set_Handled")
                        {
                            byte precedingOp = il[i - 1];
                            Assert.True(precedingOp == 0x17, "set_Handled must be called with true (ldc.i4.1).");
                            foundSetHandled = true;
                            setHandledOffset = i;
                            break;
                        }
                    }
                    catch { }
                }
            }
            Assert.True(foundSetHandled, "NewWindowRequested handler must call set_Handled(true).");

            for (int i = 0; i < setHandledOffset; i++)
            {
                byte op = il[i];
                bool isConditionalBranch = (op >= 0x2B && op <= 0x37) || (op >= 0x3E && op <= 0x44);
                Assert.False(isConditionalBranch, $"Found conditional branch (0x{op:X2}) before set_Handled! Popup suppression must be unconditional.");
            }
        }

        [Theory]
        [InlineData("https://evil.com/popup")]
        [InlineData("https://attacker.com/exploit.html")]
        [InlineData("about:blank")]
        [InlineData("_blank")]
        [InlineData("javascript:alert(1)")]
        [InlineData("data:text/html,<script>alert(1)</script>")]
        [InlineData("https://step-viewer.local/newtab")]
        [InlineData("https://step-viewer.local/")]
        [InlineData("https://cad-stream.local/cad-file")]
        [InlineData("window.open('https://attacker.com')")]
        [InlineData("")]
        [InlineData("   ")]
        [InlineData(null)]
        public void PopupSuppression_EmpiricalInvocation_UnconditionallyMarksHandledTrue(string targetUri)
        {
            var cType = typeof(WebViewEnvironmentManager).GetNestedType("<>c", BindingFlags.NonPublic);
            object targetInstance = GetClosureInstance();

            MethodInfo popupHandler = null;
            foreach (var m in cType.GetMethods(BindingFlags.NonPublic | BindingFlags.Instance))
            {
                var parameters = m.GetParameters();
                if (parameters.Length == 2 && parameters[1].ParameterType == typeof(CoreWebView2NewWindowRequestedEventArgs))
                {
                    popupHandler = m;
                    break;
                }
            }
            Assert.NotNull(popupHandler);

            Func<bool> isHandled;
            var eventArgs = CreateNewWindowArgs(targetUri, out isHandled);
            Assert.False(isHandled(), "Initial state of Handled should be false.");

            // Invoke compiled handler
            popupHandler.Invoke(targetInstance, new object[] { null, eventArgs });

            // Assert: Handled MUST be true
            Assert.True(isHandled(), $"NewWindowRequested handler must set Handled = true for target URL: {targetUri}");
            Assert.True(eventArgs.Handled, $"eventArgs.Handled must also read true for target URL: {targetUri}");
        }

        #endregion

        #region Probe 3: Navigation Cancellation & Perimeter Lockdown

        [Fact]
        public void NavigationCancellation_HandlerBytecodeEnforcesCancellationOnInvalidUrl()
        {
            var cType = typeof(WebViewEnvironmentManager).GetNestedType("<>c", BindingFlags.NonPublic);
            MethodInfo navHandler = null;
            foreach (var m in cType.GetMethods(BindingFlags.NonPublic | BindingFlags.Instance))
            {
                var parameters = m.GetParameters();
                if (parameters.Length == 2 && parameters[1].ParameterType == typeof(CoreWebView2NavigationStartingEventArgs))
                {
                    navHandler = m;
                    break;
                }
            }
            Assert.NotNull(navHandler);

            var body = navHandler.GetMethodBody();
            Assert.NotNull(body);
            byte[] il = body.GetILAsByteArray();
            var module = cType.Module;

            bool callsIsValidUrl = false;
            bool callsSetCancel = false;

            for (int i = 0; i < il.Length - 5; i++)
            {
                byte op = il[i];
                if (op == 0x28 || op == 0x6f)
                {
                    int token = BitConverter.ToInt32(il, i + 1);
                    try
                    {
                        var method = module.ResolveMethod(token);
                        if (method != null)
                        {
                            if (method.Name == "IsValidViewerNavigationUrl") callsIsValidUrl = true;
                            if (method.Name == "set_Cancel") callsSetCancel = true;
                        }
                    }
                    catch { }
                }
            }

            Assert.True(callsIsValidUrl, "NavigationStarting handler must invoke IsValidViewerNavigationUrl.");
            Assert.True(callsSetCancel, "NavigationStarting handler must invoke set_Cancel.");
        }

        [Theory]
        // Disallowed / Malicious / Bypass Attempts -> MUST BE CANCELLED (Cancel = true)
        [InlineData("https://evil.com", true)]
        [InlineData("https://evil.com/phish", true)]
        [InlineData("http://step-viewer.local/", true)]
        [InlineData("http://step-viewer.local/viewer.html", true)]
        [InlineData("https://step-viewer.local.evil.com/viewer.html", true)]
        [InlineData("https://step-viewer.local@evil.com/viewer.html", true)]
        [InlineData("https://step-viewer.local:8080/viewer.html", true)]
        [InlineData("https://cad-stream.local/cad-file", true)]
        [InlineData("file:///C:/Windows/win.ini", true)]
        [InlineData("file://127.0.0.1/share/poc.html", true)]
        [InlineData("javascript:alert(document.cookie)", true)]
        [InlineData("data:text/html,<script>alert(1)</script>", true)]
        [InlineData("blob:https://evil.com/12345", true)]
        [InlineData("chrome://settings", true)]
        [InlineData("edge://flags", true)]
        [InlineData("", true)]
        [InlineData("   ", true)]
        [InlineData(null, true)]
        // Allowed Viewer URLs -> MUST NOT BE CANCELLED (Cancel = false)
        [InlineData("https://step-viewer.local/", false)]
        [InlineData("https://step-viewer.local/viewer.html", false)]
        [InlineData("https://step-viewer.local", false)]
        [InlineData("https://step-viewer.local/index.html", false)]
        [InlineData("about:blank", false)]
        [InlineData("ABOUT:BLANK", false)]
        public void NavigationCancellation_EmpiricalInvocation_CancelsInvalidUrlsOnly(string navigationUri, bool expectedCancelled)
        {
            var cType = typeof(WebViewEnvironmentManager).GetNestedType("<>c", BindingFlags.NonPublic);
            object targetInstance = GetClosureInstance();

            MethodInfo navHandler = null;
            foreach (var m in cType.GetMethods(BindingFlags.NonPublic | BindingFlags.Instance))
            {
                var parameters = m.GetParameters();
                if (parameters.Length == 2 && parameters[1].ParameterType == typeof(CoreWebView2NavigationStartingEventArgs))
                {
                    navHandler = m;
                    break;
                }
            }
            Assert.NotNull(navHandler);

            Func<bool> isCancelled;
            var eventArgs = CreateNavigationStartingArgs(navigationUri, out isCancelled);
            Assert.False(isCancelled(), "Initial state of Cancel should be false.");

            // Invoke compiled handler
            navHandler.Invoke(targetInstance, new object[] { null, eventArgs });

            // Assert: Cancel state matches expectation
            Assert.Equal(expectedCancelled, isCancelled());
            Assert.Equal(expectedCancelled, eventArgs.Cancel);
        }

        #endregion

        #region Probe 4: Concurrency & Null Safety Stress Test

        [Fact]
        public void Concurrency_ConfigureWebView_NullArgument_DoesNotThrow()
        {
            var ex = Record.Exception(() => WebViewEnvironmentManager.ConfigureWebView(null));
            Assert.Null(ex);
        }

        [Fact]
        public void Concurrency_100ConcurrentThreads_ConfigureWebViewNullSafety()
        {
            const int threadCount = 100;
            const int iterationsPerThread = 200;
            var exceptions = new ConcurrentBag<Exception>();
            var countdown = new CountdownEvent(threadCount);
            var startSignal = new ManualResetEventSlim(false);

            var threads = new Thread[threadCount];
            for (int i = 0; i < threadCount; i++)
            {
                threads[i] = new Thread(() =>
                {
                    countdown.Signal();
                    startSignal.Wait();

                    for (int iter = 0; iter < iterationsPerThread; iter++)
                    {
                        try
                        {
                            WebViewEnvironmentManager.ConfigureWebView(null);
                        }
                        catch (Exception ex)
                        {
                            exceptions.Add(ex);
                        }
                    }
                });
                threads[i].IsBackground = true;
                threads[i].Start();
            }

            countdown.Wait();
            startSignal.Set();

            for (int i = 0; i < threadCount; i++)
            {
                threads[i].Join();
            }

            Assert.Empty(exceptions);
        }

        [Fact]
        public void Concurrency_ConcurrentHandlerInvocations_MaintainsThreadSafety()
        {
            var cType = typeof(WebViewEnvironmentManager).GetNestedType("<>c", BindingFlags.NonPublic);
            object targetInstance = GetClosureInstance();

            MethodInfo popupHandler = null;
            MethodInfo navHandler = null;
            foreach (var m in cType.GetMethods(BindingFlags.NonPublic | BindingFlags.Instance))
            {
                var p = m.GetParameters();
                if (p.Length == 2 && p[1].ParameterType == typeof(CoreWebView2NewWindowRequestedEventArgs))
                    popupHandler = m;
                if (p.Length == 2 && p[1].ParameterType == typeof(CoreWebView2NavigationStartingEventArgs))
                    navHandler = m;
            }
            Assert.NotNull(popupHandler);
            Assert.NotNull(navHandler);

            const int threadCount = 50;
            const int iterationsPerThread = 100;
            var errors = new ConcurrentBag<string>();
            var countdown = new CountdownEvent(threadCount);
            var startSignal = new ManualResetEventSlim(false);

            var threads = new Thread[threadCount];
            for (int t = 0; t < threadCount; t++)
            {
                threads[t] = new Thread(() =>
                {
                    countdown.Signal();
                    startSignal.Wait();

                    for (int i = 0; i < iterationsPerThread; i++)
                    {
                        try
                        {
                            // Test popup handler
                            Func<bool> isHandled;
                            var winArgs = CreateNewWindowArgs("https://evil.com/exploit" + i, out isHandled);
                            popupHandler.Invoke(targetInstance, new object[] { null, winArgs });
                            if (!isHandled() || !winArgs.Handled)
                            {
                                errors.Add($"Popup not handled at iteration {i}");
                            }

                            // Test nav handler with invalid url
                            Func<bool> isCancelledBad;
                            var navArgsBad = CreateNavigationStartingArgs("https://attacker.com/login" + i, out isCancelledBad);
                            navHandler.Invoke(targetInstance, new object[] { null, navArgsBad });
                            if (!isCancelledBad() || !navArgsBad.Cancel)
                            {
                                errors.Add($"Invalid URL navigation not cancelled at iteration {i}");
                            }

                            // Test nav handler with valid url
                            Func<bool> isCancelledGood;
                            var navArgsGood = CreateNavigationStartingArgs("https://step-viewer.local/model.step", out isCancelledGood);
                            navHandler.Invoke(targetInstance, new object[] { null, navArgsGood });
                            if (isCancelledGood() || navArgsGood.Cancel)
                            {
                                errors.Add($"Valid URL was incorrectly cancelled at iteration {i}");
                            }
                        }
                        catch (Exception ex)
                        {
                            errors.Add($"Exception: {ex.Message}");
                        }
                    }
                });
                threads[t].IsBackground = true;
                threads[t].Start();
            }

            countdown.Wait();
            startSignal.Set();

            for (int t = 0; t < threadCount; t++)
            {
                threads[t].Join();
            }

            Assert.Empty(errors);
        }

        #endregion
    }
}
