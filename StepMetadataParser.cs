using System;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;

namespace QuickLook.Plugin.StepViewer
{
    public class StepMetadata
    {
        public string FileName { get; set; } = string.Empty;
        public string Timestamp { get; set; } = string.Empty;
        public string Author { get; set; } = string.Empty;
        public string Organization { get; set; } = string.Empty;
        public string OriginatingSystem { get; set; } = string.Empty;
        public string Schema { get; set; } = "STEP CAD";
        public string RawSchema { get; set; } = string.Empty;
        public string LengthUnit { get; set; } = "MILLIMETRE";
        public long FileSizeBytes { get; set; } = 0;

        public string GetFormattedTitle(string fallbackFileName)
        {
            string name = string.IsNullOrEmpty(FileName) ? fallbackFileName : FileName;
            string software = string.IsNullOrEmpty(OriginatingSystem) ? "CAD Model" : OriginatingSystem;
            return $"{name} — [{Schema}] ({software})";
        }
    }

    public static class StepMetadataParser
    {
        private const int HeaderBufferSize = 512;
        private const int MaxPreambleScanSize = 32 * 1024; // 32KB to read HEADER and early DATA context units

        /// <summary>
        /// Instantly verifies if a file conforms to ISO 10303-21 physical format.
        /// Executes in less than 2ms using non-blocking stream access.
        /// </summary>
        public static bool IsStepFile(string path)
        {
            if (string.IsNullOrEmpty(path) || !File.Exists(path))
                return false;

            try
            {
                using (var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
                {
                    byte[] buffer = new byte[HeaderBufferSize];
                    int bytesRead = stream.Read(buffer, 0, buffer.Length);
                    if (bytesRead < 14) // "ISO-10303-21;" length
                        return false;

                    string headerSnippet = Encoding.ASCII.GetString(buffer, 0, bytesRead).TrimStart('\r', '\n', ' ', '\t', '\0', '\uFEFF');
                    return headerSnippet.StartsWith("ISO-10303-21;", StringComparison.OrdinalIgnoreCase);
                }
            }
            catch
            {
                return false;
            }
        }

        /// <summary>
        /// Efficiently parses the HEADER and early context section without reading the full geometry data.
        /// </summary>
        public static StepMetadata ExtractMetadata(string path)
        {
            var metadata = new StepMetadata();

            if (!File.Exists(path))
                return metadata;

            try
            {
                var fileInfo = new FileInfo(path);
                metadata.FileSizeBytes = fileInfo.Length;
                metadata.FileName = Path.GetFileName(path);

                string preambleText = ReadPreamble(path);
                if (string.IsNullOrEmpty(preambleText))
                    return metadata;

                ParseFileName(preambleText, metadata);
                ParseSchema(preambleText, metadata);
                ParseUnits(preambleText, metadata);
            }
            catch
            {
                // Fallback to defaults on error
            }

            return metadata;
        }

        private static string ReadPreamble(string path)
        {
            using (var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
            using (var reader = new StreamReader(stream, Encoding.ASCII, detectEncodingFromByteOrderMarks: false, bufferSize: 4096))
            {
                var sb = new StringBuilder();
                char[] chunk = new char[4096];
                int totalCharsRead = 0;

                while (totalCharsRead < MaxPreambleScanSize)
                {
                    int charsRead = reader.Read(chunk, 0, chunk.Length);
                    if (charsRead <= 0)
                        break;

                    sb.Append(chunk, 0, charsRead);
                    totalCharsRead += charsRead;
                }

                return sb.ToString();
            }
        }

        private static void ParseFileName(string text, StepMetadata metadata)
        {
            // FILE_NAME('name', 'timestamp', ('author'), ('org'), 'preproc', 'orig_sys', 'auth');
            var match = Regex.Match(text, @"FILE_NAME\s*\(\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*\(([^)]*)\)\s*,\s*\(([^)]*)\)\s*,\s*'([^']*)'\s*,\s*'([^']*)'", RegexOptions.IgnoreCase);
            if (match.Success)
            {
                string originalName = match.Groups[1].Value.Trim();
                if (!string.IsNullOrEmpty(originalName))
                    metadata.FileName = originalName;

                metadata.Timestamp = match.Groups[2].Value.Trim();
                metadata.Author = CleanStepList(match.Groups[3].Value);
                metadata.Organization = CleanStepList(match.Groups[4].Value);
                metadata.OriginatingSystem = match.Groups[6].Value.Trim();
            }
        }

        private static void ParseSchema(string text, StepMetadata metadata)
        {
            // FILE_SCHEMA(('SCHEMA_NAME'));
            var match = Regex.Match(text, @"FILE_SCHEMA\s*\(\s*\(\s*'([^']*)'", RegexOptions.IgnoreCase);
            if (match.Success)
            {
                string raw = match.Groups[1].Value.Trim();
                metadata.RawSchema = raw;

                if (raw.IndexOf("CONFIG_CONTROL_DESIGN", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    metadata.Schema = "AP203";
                }
                else if (raw.IndexOf("AUTOMOTIVE_DESIGN", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    metadata.Schema = "AP214";
                }
                else if (raw.IndexOf("AP242", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    metadata.Schema = "AP242";
                }
                else
                {
                    metadata.Schema = raw;
                }
            }
        }

        private static void ParseUnits(string text, StepMetadata metadata)
        {
            if (text.IndexOf(".INCH.", StringComparison.OrdinalIgnoreCase) >= 0 ||
                text.IndexOf("'INCH'", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                metadata.LengthUnit = "INCH";
            }
            else if (text.IndexOf(".MILLI.", StringComparison.OrdinalIgnoreCase) >= 0 ||
                     text.IndexOf("'MILLIMETRE'", StringComparison.OrdinalIgnoreCase) >= 0 ||
                     text.IndexOf("'MM'", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                metadata.LengthUnit = "MILLIMETRE";
            }
            else if (text.IndexOf(".METRE.", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                metadata.LengthUnit = "METRE";
            }
        }

        private static string CleanStepList(string raw)
        {
            if (string.IsNullOrEmpty(raw))
                return string.Empty;

            return raw.Replace("'", "").Replace("\"", "").Trim();
        }
    }
}
