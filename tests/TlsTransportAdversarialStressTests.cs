using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Net;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using Xunit;
using QuickLook.Plugin.StepViewer;

namespace QuickLook.Plugin.StepViewer.Tests
{
    /// <summary>
    /// Adversarial stress tests for SEC-06 Transport Security Protocols.
    /// Stress-tests downgrade resistance, concurrency, and WebClient call-site guarantees.
    /// </summary>
    public class TlsTransportAdversarialStressTests
    {
        [Fact]
        public void DowngradeAttack_WhenLegacyProtocolsForced_ConfigureSecurityProtocolsPurgesLegacyAndEnforcesTls12Tls13()
        {
            var previousProtocols = ServicePointManager.SecurityProtocol;
            try
            {
                // Adversarially simulate an active downgrade attack or legacy environment
                ServicePointManager.SecurityProtocol = SecurityProtocolType.Ssl3 | SecurityProtocolType.Tls;
                Assert.True((ServicePointManager.SecurityProtocol & SecurityProtocolType.Ssl3) != 0);
                Assert.True((ServicePointManager.SecurityProtocol & SecurityProtocolType.Tls) != 0);

                // Act: Trigger protocol configuration
                PluginUpdateService.ConfigureSecurityProtocols();

                // Assert: Protocol must be strictly upgraded; all insecure protocols purged
                Assert.False((ServicePointManager.SecurityProtocol & SecurityProtocolType.Ssl3) != 0,
                    "SecurityProtocol must NOT contain SSL 3.0 after ConfigureSecurityProtocols.");
                Assert.False((ServicePointManager.SecurityProtocol & SecurityProtocolType.Tls) != 0,
                    "SecurityProtocol must NOT contain TLS 1.0 after ConfigureSecurityProtocols.");
                Assert.False((ServicePointManager.SecurityProtocol & SecurityProtocolType.Tls11) != 0,
                    "SecurityProtocol must NOT contain TLS 1.1 after ConfigureSecurityProtocols.");
                Assert.True((ServicePointManager.SecurityProtocol & SecurityProtocolType.Tls12) != 0,
                    "SecurityProtocol must contain TLS 1.2 after ConfigureSecurityProtocols.");
                Assert.True((ServicePointManager.SecurityProtocol & SecurityProtocolType.Tls13) != 0,
                    "SecurityProtocol must contain TLS 1.3 after ConfigureSecurityProtocols.");
                Assert.Equal(SecurityProtocolType.Tls12 | SecurityProtocolType.Tls13, ServicePointManager.SecurityProtocol);
            }
            finally
            {
                ServicePointManager.SecurityProtocol = previousProtocols;
            }
        }

        [Fact]
        public async Task DowngradeAttack_WhenLegacyProtocolsForced_ResolveExpectedSha256Async_ImmediatelyEnforcesModernTls()
        {
            var previousProtocols = ServicePointManager.SecurityProtocol;
            try
            {
                // Force legacy protocol state
                ServicePointManager.SecurityProtocol = SecurityProtocolType.Ssl3 | SecurityProtocolType.Tls | SecurityProtocolType.Tls11;

                // Trigger update routine (which attempts out-of-band SHA-256 retrieval via WebClient)
                var dummyUri = new Uri("https://github.com/Mostafa214/QuickLook.Plugin.StepViewer/releases/download/v9.9.9/package.qlplugin");
                try
                {
                    await PluginUpdateService.ResolveExpectedSha256Async(dummyUri, "v9.9.9");
                }
                catch
                {
                    // Network call to dummy release may throw or return null; protocol configuration must happen regardless
                }

                // Assert protocol was upgraded immediately prior to network execution
                Assert.False((ServicePointManager.SecurityProtocol & SecurityProtocolType.Ssl3) != 0);
                Assert.False((ServicePointManager.SecurityProtocol & SecurityProtocolType.Tls) != 0);
                Assert.False((ServicePointManager.SecurityProtocol & SecurityProtocolType.Tls11) != 0);
                Assert.True((ServicePointManager.SecurityProtocol & SecurityProtocolType.Tls12) != 0);
                Assert.True((ServicePointManager.SecurityProtocol & SecurityProtocolType.Tls13) != 0);
                Assert.Equal(SecurityProtocolType.Tls12 | SecurityProtocolType.Tls13, ServicePointManager.SecurityProtocol);
            }
            finally
            {
                ServicePointManager.SecurityProtocol = previousProtocols;
            }
        }

        [Fact]
        public void IdempotencyAndThreadSafety_100ConcurrentThreads_ProtocolFlagsRemainStrictlyTls12AndTls13()
        {
            var previousProtocols = ServicePointManager.SecurityProtocol;
            try
            {
                const int threadCount = 100;
                const int iterationsPerThread = 200;
                var failures = new ConcurrentBag<string>();
                var countdown = new CountdownEvent(threadCount);
                var startSignal = new ManualResetEventSlim(false);
                var expected = SecurityProtocolType.Tls12 | SecurityProtocolType.Tls13;

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
                                PluginUpdateService.ConfigureSecurityProtocols();
                                var current = ServicePointManager.SecurityProtocol;
                                if (current != expected)
                                {
                                    failures.Add($"Thread observed unexpected protocol flags: {current}");
                                }
                            }
                            catch (Exception ex)
                            {
                                failures.Add($"Thread encountered exception: {ex.Message}");
                            }
                        }
                    });
                    threads[i].IsBackground = true;
                    threads[i].Start();
                }

                // Wait for all 100 threads to queue at the barrier, then release all simultaneously
                countdown.Wait();
                startSignal.Set();

                for (int i = 0; i < threadCount; i++)
                {
                    threads[i].Join();
                }

                Assert.Empty(failures);
                Assert.Equal(expected, ServicePointManager.SecurityProtocol);
            }
            finally
            {
                ServicePointManager.SecurityProtocol = previousProtocols;
            }
        }

        [Fact]
        public void WebClientExecutionProbe_EveryWebClientInstantiationInPluginUpdateService_GuaranteesConfigureSecurityProtocolsInvoked()
        {
            var serviceType = typeof(PluginUpdateService);
            var typesToInspect = new List<Type> { serviceType };
            typesToInspect.AddRange(serviceType.GetNestedTypes(BindingFlags.Public | BindingFlags.NonPublic));

            int totalWebClientSites = 0;
            int unhardenedSites = 0;
            var failureDetails = new List<string>();

            foreach (var type in typesToInspect)
            {
                var methods = type.GetMethods(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly);
                foreach (var method in methods)
                {
                    var body = method.GetMethodBody();
                    if (body == null) continue;

                    byte[] il = body.GetILAsByteArray();
                    var webClientOffsets = new List<int>();
                    var configProtocolsOffsets = new List<int>();

                    for (int i = 0; i < il.Length; i++)
                    {
                        byte op = il[i];
                        if (op == 0x73) // newobj
                        {
                            int token = BitConverter.ToInt32(il, i + 1);
                            try
                            {
                                var callee = type.Module.ResolveMethod(token);
                                if (callee != null && callee.DeclaringType == typeof(WebClient))
                                {
                                    webClientOffsets.Add(i);
                                }
                            }
                            catch { }
                            i += 4;
                        }
                        else if (op == 0x28 || op == 0x6f) // call or callvirt
                        {
                            int token = BitConverter.ToInt32(il, i + 1);
                            try
                            {
                                var callee = type.Module.ResolveMethod(token);
                                if (callee != null && callee.Name == "ConfigureSecurityProtocols")
                                {
                                    configProtocolsOffsets.Add(i);
                                }
                            }
                            catch { }
                            i += 4;
                        }
                    }

                    if (webClientOffsets.Count > 0)
                    {
                        totalWebClientSites += webClientOffsets.Count;
                        if (configProtocolsOffsets.Count == 0)
                        {
                            unhardenedSites += webClientOffsets.Count;
                            failureDetails.Add($"Method {type.Name}::{method.Name} instantiates WebClient ({webClientOffsets.Count} sites) without calling ConfigureSecurityProtocols.");
                        }
                        else
                        {
                            // Verify that every WebClient is preceded by ConfigureSecurityProtocols
                            int firstWebClient = webClientOffsets[0];
                            int firstConfig = configProtocolsOffsets[0];
                            Assert.True(firstConfig < firstWebClient,
                                $"In {type.Name}::{method.Name}, ConfigureSecurityProtocols (offset {firstConfig}) must precede WebClient instantiation (offset {firstWebClient}).");
                        }
                    }
                }
            }

            Assert.True(totalWebClientSites > 0, "At least one WebClient call site must be identified in PluginUpdateService.");
            Assert.True(unhardenedSites == 0, string.Join("; ", failureDetails));
        }

        [Fact]
        public void StaticConstructor_GuaranteesInitialProtocolHardening()
        {
            var serviceType = typeof(PluginUpdateService);
            var cctor = serviceType.TypeInitializer;
            Assert.NotNull(cctor);

            var body = cctor.GetMethodBody();
            Assert.NotNull(body);

            byte[] il = body.GetILAsByteArray();
            bool callsConfigureSecurityProtocols = false;

            for (int i = 0; i < il.Length; i++)
            {
                byte op = il[i];
                if (op == 0x28 || op == 0x6f)
                {
                    int token = BitConverter.ToInt32(il, i + 1);
                    try
                    {
                        var callee = serviceType.Module.ResolveMethod(token);
                        if (callee != null && callee.Name == "ConfigureSecurityProtocols")
                        {
                            callsConfigureSecurityProtocols = true;
                            break;
                        }
                    }
                    catch { }
                    i += 4;
                }
            }

            Assert.True(callsConfigureSecurityProtocols,
                "PluginUpdateService static constructor (.cctor) must invoke ConfigureSecurityProtocols.");
        }
    }
}
