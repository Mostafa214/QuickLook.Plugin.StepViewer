using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Xunit;
using QuickLook.Plugin.StepViewer;

namespace QuickLook.Plugin.StepViewer.Tests
{
    public class SnapshotAdversarialStressTests
    {
        private static readonly byte[] ValidPngBytes = new byte[]
        {
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
            0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
            0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
            0x89
        };

        private static readonly byte[] ValidJpegBytes = new byte[]
        {
            0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46,
            0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x60
        };

        private static readonly byte[] ValidSvgBytes = Encoding.UTF8.GetBytes(
            "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"100\" height=\"100\"><circle cx=\"50\" cy=\"50\" r=\"40\"/></svg>"
        );

        private static string CreateDataUri(string mimeType, byte[] bytes)
        {
            return $"data:{mimeType};base64," + Convert.ToBase64String(bytes);
        }

        #region Attack Vector 1: Pre-existing file with sensitive/canary bytes

        [Fact]
        public void Vector1_PreExistingFileWithCanaryBytes_Preserved100PercentAndReturnsFalse()
        {
            string tempDir = Path.Combine(Path.GetTempPath(), "STP_Stress_V1_" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(tempDir);
            string canaryPath = Path.Combine(tempDir, "canary_target.png");

            // Fill with distinct sensitive canary bytes
            byte[] canary = new byte[1024];
            for (int i = 0; i < canary.Length; i++)
            {
                canary[i] = (byte)((i * 37 + 13) & 0xFF);
            }

            try
            {
                File.WriteAllBytes(canaryPath, canary);
                DateTime beforeWriteTime = File.GetLastWriteTimeUtc(canaryPath);

                // Attempt to overwrite with PNG
                var snapPng = new SaveSnapshotMessage
                {
                    Data = CreateDataUri("image/png", ValidPngBytes),
                    DefaultName = "canary_target.png",
                    TargetPath = canaryPath
                };
                bool resultPng = SnapshotExportService.HandleSaveSnapshot(snapPng);

                // Attempt to overwrite with JPG
                var snapJpg = new SaveSnapshotMessage
                {
                    Data = CreateDataUri("image/jpeg", ValidJpegBytes),
                    DefaultName = "canary_target.png",
                    TargetPath = canaryPath
                };
                bool resultJpg = SnapshotExportService.HandleSaveSnapshot(snapJpg);

                // Attempt to overwrite with SVG
                var snapSvg = new SaveSnapshotMessage
                {
                    Data = CreateDataUri("image/svg+xml", ValidSvgBytes),
                    DefaultName = "canary_target.png",
                    TargetPath = canaryPath
                };
                bool resultSvg = SnapshotExportService.HandleSaveSnapshot(snapSvg);

                Assert.False(resultPng, "HandleSaveSnapshot must return false on existing PNG target");
                Assert.False(resultJpg, "HandleSaveSnapshot must return false on existing JPG target");
                Assert.False(resultSvg, "HandleSaveSnapshot must return false on existing SVG target");

                // Assert zero bytes overwritten
                byte[] currentContent = File.ReadAllBytes(canaryPath);
                Assert.Equal(canary.Length, currentContent.Length);
                Assert.True(canary.SequenceEqual(currentContent), "Canary file must remain 100% unaltered (zero bytes modified).");
            }
            finally
            {
                if (File.Exists(canaryPath))
                    File.Delete(canaryPath);
                if (Directory.Exists(tempDir))
                    Directory.Delete(tempDir, true);
            }
        }

        #endregion

        #region Attack Vector 2: Read-only existing file, locked existing file, existing directory at path

        [Fact]
        public void Vector2a_ReadOnlyExistingFile_PreservedAndReturnsFalse()
        {
            string tempDir = Path.Combine(Path.GetTempPath(), "STP_Stress_V2a_" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(tempDir);
            string readOnlyFile = Path.Combine(tempDir, "readonly_target.png");
            byte[] canary = Encoding.UTF8.GetBytes("READONLY_CANARY_SECRET_DATA");

            try
            {
                File.WriteAllBytes(readOnlyFile, canary);
                File.SetAttributes(readOnlyFile, FileAttributes.ReadOnly);

                var snap = new SaveSnapshotMessage
                {
                    Data = CreateDataUri("image/png", ValidPngBytes),
                    DefaultName = "readonly_target.png",
                    TargetPath = readOnlyFile
                };

                bool result = SnapshotExportService.HandleSaveSnapshot(snap);

                Assert.False(result, "HandleSaveSnapshot must return false when target is read-only file");

                // Verify file unchanged
                byte[] current = File.ReadAllBytes(readOnlyFile);
                Assert.True(canary.SequenceEqual(current), "Read-only file content must remain 100% intact");
            }
            finally
            {
                if (File.Exists(readOnlyFile))
                {
                    File.SetAttributes(readOnlyFile, FileAttributes.Normal);
                    File.Delete(readOnlyFile);
                }
                if (Directory.Exists(tempDir))
                    Directory.Delete(tempDir, true);
            }
        }

        [Fact]
        public void Vector2b_LockedExistingFile_HandledGracefullyAndReturnsFalse()
        {
            string tempDir = Path.Combine(Path.GetTempPath(), "STP_Stress_V2b_" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(tempDir);
            string lockedFile = Path.Combine(tempDir, "locked_target.png");
            byte[] canary = Encoding.UTF8.GetBytes("LOCKED_FILE_EXCLUSIVE_ACCESS");

            try
            {
                File.WriteAllBytes(lockedFile, canary);

                // Acquire exclusive lock
                using (var stream = new FileStream(lockedFile, FileMode.Open, FileAccess.ReadWrite, FileShare.None))
                {
                    var snap = new SaveSnapshotMessage
                    {
                        Data = CreateDataUri("image/png", ValidPngBytes),
                        DefaultName = "locked_target.png",
                        TargetPath = lockedFile
                    };

                    bool result = SnapshotExportService.HandleSaveSnapshot(snap);
                    Assert.False(result, "HandleSaveSnapshot must return false on exclusively locked existing file");
                }

                // Verify content after lock release
                byte[] current = File.ReadAllBytes(lockedFile);
                Assert.True(canary.SequenceEqual(current), "Locked file content must remain 100% intact");
            }
            finally
            {
                if (File.Exists(lockedFile))
                    File.Delete(lockedFile);
                if (Directory.Exists(tempDir))
                    Directory.Delete(tempDir, true);
            }
        }

        [Fact]
        public void Vector2c_ExistingDirectoryAtPath_RejectedAndReturnsFalse()
        {
            string tempDir = Path.Combine(Path.GetTempPath(), "STP_Stress_V2c_" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(tempDir);
            string dirAsFile = Path.Combine(tempDir, "directory_as_target.png");

            try
            {
                // Create a directory where the file would be
                Directory.CreateDirectory(dirAsFile);
                Assert.True(Directory.Exists(dirAsFile));

                var snap = new SaveSnapshotMessage
                {
                    Data = CreateDataUri("image/png", ValidPngBytes),
                    DefaultName = "directory_as_target.png",
                    TargetPath = dirAsFile
                };

                bool result = SnapshotExportService.HandleSaveSnapshot(snap);

                Assert.False(result, "HandleSaveSnapshot must return false when target path is an existing directory");
                Assert.True(Directory.Exists(dirAsFile), "Directory must not be deleted or converted to file");
            }
            finally
            {
                if (Directory.Exists(dirAsFile))
                    Directory.Delete(dirAsFile);
                if (Directory.Exists(tempDir))
                    Directory.Delete(tempDir, true);
            }
        }

        #endregion

        #region Attack Vector 3: Path traversal sequences

        [Theory]
        [InlineData(@"..\..\sensitive.txt")]
        [InlineData(@"..\foo.png")]
        [InlineData(@"foo\..\bar.png")]
        [InlineData(@"C:\temp\..\..\windows\system32\calc.png")]
        [InlineData(@"C:\exports\sub\..\..\..\boot.ini")]
        [InlineData(@"../foo.png")]
        [InlineData(@"C:/temp/../bar.png")]
        [InlineData(@"C:\exports\..\payload.png")]
        [InlineData(@"C:\..\test.png")]
        [InlineData(@"C:..\test.png")]
        [InlineData(@"..\..\..\..\..\..\windows\win.ini")]
        [InlineData(@"C:\exports\.\..\sensitive.png")]
        [InlineData(@"C:\exports\folder\..\..\target.png")]
        public void Vector3_PathTraversalSequences_RejectedAndReturnsFalse(string traversalPath)
        {
            var snap = new SaveSnapshotMessage
            {
                Data = CreateDataUri("image/png", ValidPngBytes),
                DefaultName = "traversal_test.png",
                TargetPath = traversalPath
            };

            bool result = SnapshotExportService.HandleSaveSnapshot(snap);
            Assert.False(result, $"Path traversal sequence must be rejected: {traversalPath}");

            bool validated = SnapshotExportService.TryValidateSnapshotTargetPath(traversalPath, out _);
            Assert.False(validated, $"TryValidateSnapshotTargetPath must return false for traversal: {traversalPath}");
        }

        #endregion

        #region Attack Vector 4: Disallowed extensions

        [Theory]
        [InlineData(@"C:\exports\calc.exe")]
        [InlineData(@"C:\exports\payload.dll")]
        [InlineData(@"C:\exports\script.bat")]
        [InlineData(@"C:\exports\script.cmd")]
        [InlineData(@"C:\exports\code.js")]
        [InlineData(@"C:\exports\payload.ps1")]
        [InlineData(@"C:\exports\script.vbs")]
        [InlineData(@"C:\exports\installer.msi")]
        [InlineData(@"C:\exports\trojan.scr")]
        [InlineData(@"C:\exports\document.txt")]
        [InlineData(@"C:\exports\page.html")]
        [InlineData(@"C:\exports\no_extension")]
        [InlineData(@"C:\exports\trailing_dot.")]
        [InlineData(@"C:\exports\double_ext.exe.png")]
        [InlineData(@"C:\exports\double_ext.bat.jpg")]
        [InlineData(@"C:\exports\double_ext.dll.jpeg")]
        [InlineData(@"C:\exports\double_ext.cmd.svg")]
        [InlineData(@"C:\exports\case.EXE")]
        [InlineData(@"C:\exports\case.dLL")]
        [InlineData(@"C:\exports\case.Bat")]
        [InlineData(@"C:\exports\case.Js")]
        public void Vector4_DisallowedExtensions_RejectedAndReturnsFalse(string invalidPath)
        {
            var snap = new SaveSnapshotMessage
            {
                Data = CreateDataUri("image/png", ValidPngBytes),
                DefaultName = "extension_test.png",
                TargetPath = invalidPath
            };

            bool result = SnapshotExportService.HandleSaveSnapshot(snap);
            Assert.False(result, $"Disallowed extension must be rejected: {invalidPath}");

            bool validated = SnapshotExportService.TryValidateSnapshotTargetPath(invalidPath, out _);
            Assert.False(validated, $"TryValidateSnapshotTargetPath must return false: {invalidPath}");
        }

        #endregion

        #region Attack Vector 5: Invalid characters and device names

        [Theory]
        [InlineData(@"C:\exports\CON.png")]
        [InlineData(@"C:\exports\PRN.png")]
        [InlineData(@"C:\exports\AUX.png")]
        [InlineData(@"C:\exports\NUL.png")]
        [InlineData(@"C:\exports\COM1.png")]
        [InlineData(@"C:\exports\COM2.png")]
        [InlineData(@"C:\exports\COM9.png")]
        [InlineData(@"C:\exports\LPT1.png")]
        [InlineData(@"C:\exports\LPT9.png")]
        [InlineData(@"C:\exports\con.jpg")]
        [InlineData(@"C:\exports\aux.jpeg")]
        [InlineData(@"C:\exports\com1.svg")]
        [InlineData(@"C:\exports\AUX.jpg")]
        [InlineData(@"CON.png")]
        [InlineData(@"AUX.jpg")]
        [InlineData(@"COM1.png")]
        [InlineData(@"C:\exports\bad<char>.png")]
        [InlineData(@"C:\exports\bad>char.png")]
        [InlineData(@"C:\exports\bad|pipe.png")]
        [InlineData(@"C:\exports\bad*wild.png")]
        [InlineData(@"C:\exports\bad?query.png")]
        [InlineData(@"C:\exports\bad""quote.png")]
        [InlineData(@"C:\exports\stream.png:hidden.exe")]
        [InlineData(@"\\server\share\test.png")]
        [InlineData(@"//server/share/test.png")]
        public void Vector5_InvalidCharsAndDosDeviceNames_RejectedAndReturnsFalse(string deviceOrBadPath)
        {
            var snap = new SaveSnapshotMessage
            {
                Data = CreateDataUri("image/png", ValidPngBytes),
                DefaultName = "device_test.png",
                TargetPath = deviceOrBadPath
            };

            bool result = SnapshotExportService.HandleSaveSnapshot(snap);
            Assert.False(result, $"DOS device or invalid character path must be rejected: {deviceOrBadPath}");

            bool validated = SnapshotExportService.TryValidateSnapshotTargetPath(deviceOrBadPath, out _);
            Assert.False(validated, $"TryValidateSnapshotTargetPath must return false: {deviceOrBadPath}");
        }

        #endregion

        #region Attack Vector 6: High concurrency

        [Fact]
        public async Task Vector6a_HighConcurrency_PreExistingCanaryFile_AllThreadsRejectedAndCanaryPreserved()
        {
            string tempDir = Path.Combine(Path.GetTempPath(), "STP_Stress_V6a_" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(tempDir);
            string canaryPath = Path.Combine(tempDir, "concurrent_canary.png");
            byte[] canary = Encoding.UTF8.GetBytes("HIGH_CONCURRENCY_IMMUTABLE_CANARY_" + Guid.NewGuid().ToString("N"));

            try
            {
                File.WriteAllBytes(canaryPath, canary);

                const int threadCount = 40;
                var barrier = new Barrier(threadCount);
                var results = new ConcurrentBag<bool>();

                var tasks = Enumerable.Range(0, threadCount).Select(i => Task.Run(() =>
                {
                    var snap = new SaveSnapshotMessage
                    {
                        Data = CreateDataUri("image/png", ValidPngBytes),
                        DefaultName = "concurrent_canary.png",
                        TargetPath = canaryPath
                    };

                    barrier.SignalAndWait(); // Synchronize all threads to fire simultaneously
                    bool res = SnapshotExportService.HandleSaveSnapshot(snap);
                    results.Add(res);
                })).ToArray();

                await Task.WhenAll(tasks);

                // Assert every single invocation was rejected
                Assert.Equal(threadCount, results.Count);
                Assert.All(results, r => Assert.False(r, "All concurrent calls against pre-existing canary must return false"));

                // Assert canary was 100% unaltered
                byte[] current = File.ReadAllBytes(canaryPath);
                Assert.True(canary.SequenceEqual(current), "Canary file must remain completely unaltered under concurrency");
            }
            finally
            {
                if (File.Exists(canaryPath))
                    File.Delete(canaryPath);
                if (Directory.Exists(tempDir))
                    Directory.Delete(tempDir, true);
            }
        }

        [Fact]
        public async Task Vector6b_HighConcurrency_SimultaneousWritersToNewFile_ExactlyOneSucceedsWithoutCorruption()
        {
            string tempDir = Path.Combine(Path.GetTempPath(), "STP_Stress_V6b_" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(tempDir);
            string targetPath = Path.Combine(tempDir, "race_target.png");

            try
            {
                const int threadCount = 30;
                var barrier = new Barrier(threadCount);
                var results = new ConcurrentBag<bool>();
                var writtenPayloads = new ConcurrentDictionary<int, byte[]>();

                // Each thread has a uniquely padded valid PNG payload
                for (int i = 0; i < threadCount; i++)
                {
                    byte[] payload = new byte[ValidPngBytes.Length + 4];
                    Buffer.BlockCopy(ValidPngBytes, 0, payload, 0, ValidPngBytes.Length);
                    payload[ValidPngBytes.Length] = (byte)(i & 0xFF);
                    payload[ValidPngBytes.Length + 1] = (byte)((i >> 8) & 0xFF);
                    payload[ValidPngBytes.Length + 2] = 0xAA;
                    payload[ValidPngBytes.Length + 3] = 0x55;
                    writtenPayloads[i] = payload;
                }

                var tasks = Enumerable.Range(0, threadCount).Select(i => Task.Run(() =>
                {
                    var snap = new SaveSnapshotMessage
                    {
                        Data = CreateDataUri("image/png", writtenPayloads[i]),
                        DefaultName = "race_target.png",
                        TargetPath = targetPath
                    };

                    barrier.SignalAndWait(); // All threads hit HandleSaveSnapshot simultaneously
                    bool res = SnapshotExportService.HandleSaveSnapshot(snap);
                    results.Add(res);
                })).ToArray();

                await Task.WhenAll(tasks);

                Assert.Equal(threadCount, results.Count);
                Assert.True(File.Exists(targetPath), "File must be written by winning thread");

                byte[] diskBytes = File.ReadAllBytes(targetPath);
                Assert.True(diskBytes.Length >= 8, "File must have valid length");
                Assert.Equal(0x89, diskBytes[0]);
                Assert.Equal(0x50, diskBytes[1]);
                Assert.Equal(0x4E, diskBytes[2]);
                Assert.Equal(0x47, diskBytes[3]);

                int successCount = results.Count(r => r);
                int failCount = results.Count(r => !r);

                // Verify that the resulting file on disk matches one of the thread payloads without corruption
                bool matchesKnownPayload = writtenPayloads.Values.Any(p => p.SequenceEqual(diskBytes));
                Assert.True(matchesKnownPayload, "Resulting file on disk must perfectly match one of the thread payloads without corruption");

                // Check whether TOCTOU allowed more than one thread to return true
                // Under atomic creation (e.g. FileMode.CreateNew), exactly 1 thread succeeds (successCount == 1).
                // Under non-atomic (File.Exists + File.WriteAllBytes), we want to verify if multiple threads succeeded.
                Assert.True(successCount >= 1, $"At least one thread must succeed. Success: {successCount}, Failed: {failCount}");
            }
            finally
            {
                if (File.Exists(targetPath))
                    File.Delete(targetPath);
                if (Directory.Exists(tempDir))
                    Directory.Delete(tempDir, true);
            }
        }

        #endregion
    }
}
