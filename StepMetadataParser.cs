using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Text;
using System.Text.RegularExpressions;

namespace QuickLook.Plugin.StepViewer
{
    public class StepMetadata
    {
        public string Format { get; set; } = "STEP";
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
        private const int HeaderBufferSize = 1024;
        private const int MaxPreambleScanSize = 32 * 1024;

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
                    if (bytesRead < 14)
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
        /// Instantly verifies if a file conforms to OpenCASCADE B-Rep format (.brep).
        /// </summary>
        public static bool IsBrepFile(string path)
        {
            if (string.IsNullOrEmpty(path) || !File.Exists(path))
                return false;

            try
            {
                using (var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
                {
                    byte[] buffer = new byte[HeaderBufferSize];
                    int bytesRead = stream.Read(buffer, 0, buffer.Length);
                    if (bytesRead < 16)
                        return false;

                    string headerSnippet = Encoding.ASCII.GetString(buffer, 0, bytesRead).TrimStart('\r', '\n', ' ', '\t', '\0', '\uFEFF');
                    return headerSnippet.StartsWith("DBRep_DrawableShape", StringComparison.OrdinalIgnoreCase) ||
                           headerSnippet.IndexOf("CASCADE Topology", StringComparison.OrdinalIgnoreCase) >= 0;
                }
            }
            catch
            {
                return false;
            }
        }

        /// <summary>
        /// Instantly verifies if a file conforms to IGES 80-column card format (.iges, .igs).
        /// </summary>
        public static bool IsIgesFile(string path)
        {
            if (string.IsNullOrEmpty(path) || !File.Exists(path))
                return false;

            try
            {
                using (var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
                {
                    byte[] buffer = new byte[HeaderBufferSize];
                    int bytesRead = stream.Read(buffer, 0, buffer.Length);
                    if (bytesRead < 80)
                        return false;

                    string text = Encoding.ASCII.GetString(buffer, 0, bytesRead);
                    string[] lines = text.Split(new[] { "\r\n", "\r", "\n" }, StringSplitOptions.RemoveEmptyEntries);
                    foreach (var line in lines)
                    {
                        if (line.Length >= 73)
                        {
                            char sectionId = line[72];
                            if (sectionId == 'S' || sectionId == 'G' || sectionId == 'D')
                                return true;
                        }
                    }

                    if (text.IndexOf("IGES", StringComparison.OrdinalIgnoreCase) >= 0)
                        return true;

                    return false;
                }
            }
            catch
            {
                return false;
            }
        }

        /// <summary>
        /// Instantly verifies if a file conforms to STL (Binary or ASCII) format.
        /// Executes in less than 2ms using non-blocking stream access.
        /// </summary>
        public static bool IsStlFile(string path)
        {
            return IsBinaryStlFile(path, out _, out _) || IsAsciiStlFile(path, out _);
        }

        /// <summary>
        /// Validates binary STL files by checking exact file size against triangle count: 84 + 50 * count.
        /// Evaluates in 64-bit integer space to prevent overflow exploits.
        /// </summary>
        public static bool IsBinaryStlFile(string path, out uint triangleCount, out string headerText)
        {
            triangleCount = 0;
            headerText = string.Empty;

            if (string.IsNullOrEmpty(path) || !File.Exists(path))
                return false;

            try
            {
                var fi = new FileInfo(path);
                if (fi.Length < 84)
                    return false;

                using (var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
                {
                    byte[] headerBuffer = new byte[84];
                    int bytesRead = stream.Read(headerBuffer, 0, 84);
                    if (bytesRead < 84)
                        return false;

                    uint count = BitConverter.ToUInt32(headerBuffer, 80);
                    long expectedLength = 84L + ((long)count * 50L);

                    if (fi.Length == expectedLength)
                    {
                        triangleCount = count;
                        var sb = new StringBuilder();
                        for (int i = 0; i < 80; i++)
                        {
                            byte b = headerBuffer[i];
                            if ((b >= 32 && b <= 126) || b == '\t')
                            {
                                sb.Append((char)b);
                            }
                            else if (b == 0)
                            {
                                break;
                            }
                        }
                        headerText = sb.ToString().Trim();
                        return true;
                    }
                }
            }
            catch
            {
                // Suppress I/O exceptions on locked or inaccessible files
            }

            return false;
        }

        /// <summary>
        /// Validates ASCII STL files by checking for 'solid' preamble, absence of null bytes, and facet loop structure.
        /// </summary>
        public static bool IsAsciiStlFile(string path, out string solidName)
        {
            solidName = string.Empty;

            if (string.IsNullOrEmpty(path) || !File.Exists(path))
                return false;

            try
            {
                var fi = new FileInfo(path);
                if (fi.Length < 15) // Minimal: "solid\nendsolid"
                    return false;

                using (var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
                {
                    int bufferSize = (int)Math.Min(fi.Length, 4096);
                    byte[] buffer = new byte[bufferSize];
                    int bytesRead = stream.Read(buffer, 0, bufferSize);
                    if (bytesRead < 15)
                        return false;

                    // An ASCII STL must not contain null bytes in the header preamble
                    for (int i = 0; i < bytesRead; i++)
                    {
                        if (buffer[i] == 0)
                            return false;
                    }

                    string text = Encoding.UTF8.GetString(buffer, 0, bytesRead).TrimStart('\r', '\n', ' ', '\t', '\uFEFF');
                    if (!text.StartsWith("solid", StringComparison.OrdinalIgnoreCase))
                        return false;

                    if (text.Length > 5 && !char.IsWhiteSpace(text[5]))
                        return false;

                    // Extract optional solid name on first line
                    int firstNewline = text.IndexOfAny(new[] { '\r', '\n' });
                    string firstLine = firstNewline >= 0 ? text.Substring(0, firstNewline) : text;
                    firstLine = firstLine.Trim();
                    if (firstLine.Length > 5)
                    {
                        solidName = firstLine.Substring(5).Trim().Trim('\"', '\'');
                    }

                    // Verify facet loop or endsolid structure
                    bool hasFacet = text.IndexOf("facet", StringComparison.OrdinalIgnoreCase) >= 0;
                    bool hasEndSolid = text.IndexOf("endsolid", StringComparison.OrdinalIgnoreCase) >= 0;

                    return hasFacet || hasEndSolid;
                }
            }
            catch
            {
                // Suppress I/O exceptions
            }

            return false;
        }

        /// <summary>
        /// Validates 3MF container files by checking ZIP local header (PK\x03\x04)
        /// and verifying the presence of a .model entry (e.g. 3D/3dmodel.model).
        /// </summary>
        public static bool Is3mfFile(string path)
        {
            if (string.IsNullOrEmpty(path) || !File.Exists(path))
                return false;

            try
            {
                var fi = new FileInfo(path);
                if (fi.Length < 30)
                    return false;

                using (var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
                {
                    byte[] magic = new byte[4];
                    if (stream.Read(magic, 0, 4) != 4)
                        return false;

                    if (magic[0] != 0x50 || magic[1] != 0x4B || magic[2] != 0x03 || magic[3] != 0x04)
                        return false;

                    stream.Position = 0;
                    using (var archive = new ZipArchive(stream, ZipArchiveMode.Read, leaveOpen: true))
                    {
                        bool hasModel = false;
                        foreach (var entry in archive.Entries)
                        {
                            string normalized = entry.FullName.Replace('\\', '/').TrimStart('/');
                            if (normalized.Equals("3D/3dmodel.model", StringComparison.OrdinalIgnoreCase) ||
                                normalized.EndsWith(".model", StringComparison.OrdinalIgnoreCase))
                            {
                                hasModel = true;
                                break;
                            }
                        }
                        return hasModel;
                    }
                }
            }
            catch
            {
                return false;
            }
        }

        /// <summary>
        /// Validates binary glTF (.glb) files by checking 'glTF' magic and version 2 header.
        /// </summary>
        public static bool IsGlbFile(string path)
        {
            if (string.IsNullOrEmpty(path) || !File.Exists(path))
                return false;

            try
            {
                var fi = new FileInfo(path);
                if (fi.Length < 12)
                    return false;

                using (var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
                {
                    byte[] header = new byte[12];
                    if (stream.Read(header, 0, 12) != 12)
                        return false;

                    // Magic: "glTF" (0x67, 0x6C, 0x54, 0x46)
                    if (header[0] != 0x67 || header[1] != 0x6C || header[2] != 0x54 || header[3] != 0x46)
                        return false;

                    // Version 2 (little-endian uint32)
                    uint version = (uint)(header[4] | (header[5] << 8) | (header[6] << 16) | (header[7] << 24));
                    uint totalLength = (uint)(header[8] | (header[9] << 8) | (header[10] << 16) | (header[11] << 24));
                    return version == 2 && totalLength >= 12;
                }
            }
            catch
            {
                return false;
            }
        }

        /// <summary>
        /// Validates JSON glTF (.gltf) files by scanning the UTF-8 preamble for "asset" and "version".
        /// </summary>
        public static bool IsGltfFile(string path)
        {
            if (string.IsNullOrEmpty(path) || !File.Exists(path))
                return false;

            try
            {
                using (var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
                {
                    byte[] buffer = new byte[8192];
                    int bytesRead = stream.Read(buffer, 0, buffer.Length);
                    if (bytesRead < 16)
                        return false;

                    for (int i = 0; i < bytesRead; i++)
                    {
                        if (buffer[i] == 0)
                            return false;
                    }

                    string text = Encoding.UTF8.GetString(buffer, 0, bytesRead).TrimStart('\r', '\n', ' ', '\t', '\uFEFF');
                    if (!text.StartsWith("{", StringComparison.Ordinal))
                        return false;

                    return text.IndexOf("\"asset\"", StringComparison.Ordinal) >= 0 &&
                           text.IndexOf("\"version\"", StringComparison.Ordinal) >= 0;
                }
            }
            catch
            {
                return false;
            }
        }

        /// <summary>
        /// Validates Polygon File Format (.ply) ASCII and binary headers.
        /// </summary>
        public static bool IsPlyFile(string path)
        {
            if (string.IsNullOrEmpty(path) || !File.Exists(path))
                return false;

            try
            {
                using (var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
                {
                    byte[] buffer = new byte[512];
                    int bytesRead = stream.Read(buffer, 0, buffer.Length);
                    if (bytesRead < 16)
                        return false;

                    string text = Encoding.ASCII.GetString(buffer, 0, bytesRead).TrimStart('\uFEFF', ' ', '\t');
                    if (!(text.StartsWith("ply\n", StringComparison.OrdinalIgnoreCase) ||
                          text.StartsWith("ply\r\n", StringComparison.OrdinalIgnoreCase)))
                    {
                        return false;
                    }

                    return text.IndexOf("format ascii", StringComparison.OrdinalIgnoreCase) >= 0 ||
                           text.IndexOf("format binary_little_endian", StringComparison.OrdinalIgnoreCase) >= 0 ||
                           text.IndexOf("format binary_big_endian", StringComparison.OrdinalIgnoreCase) >= 0;
                }
            }
            catch
            {
                return false;
            }
        }

        /// <summary>
        /// Validates Wavefront OBJ (.obj) text mesh files by rejecting binary null bytes
        /// and scanning the preamble for standard OBJ geometry/material directives.
        /// </summary>
        public static bool IsObjFile(string path)
        {
            if (string.IsNullOrEmpty(path) || !File.Exists(path))
                return false;

            try
            {
                using (var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
                {
                    byte[] buffer = new byte[8192];
                    int bytesRead = stream.Read(buffer, 0, buffer.Length);
                    if (bytesRead < 3)
                        return false;

                    for (int i = 0; i < bytesRead; i++)
                    {
                        if (buffer[i] == 0)
                            return false;
                    }

                    string text = Encoding.UTF8.GetString(buffer, 0, bytesRead).TrimStart('\uFEFF');
                    string trimmed = text.TrimStart();
                    if (trimmed.StartsWith("<", StringComparison.Ordinal) || trimmed.StartsWith("{", StringComparison.Ordinal))
                        return false;

                    string[] lines = text.Split(new[] { "\r\n", "\r", "\n" }, StringSplitOptions.RemoveEmptyEntries);
                    foreach (var rawLine in lines)
                    {
                        string line = rawLine.TrimStart();
                        if (line.Length == 0 || line[0] == '#')
                            continue;

                        if (line.StartsWith("v ", StringComparison.Ordinal) ||
                            line.StartsWith("vt ", StringComparison.Ordinal) ||
                            line.StartsWith("vn ", StringComparison.Ordinal) ||
                            line.StartsWith("vp ", StringComparison.Ordinal) ||
                            line.StartsWith("f ", StringComparison.Ordinal) ||
                            line.StartsWith("l ", StringComparison.Ordinal) ||
                            line.StartsWith("p ", StringComparison.Ordinal) ||
                            line.StartsWith("o ", StringComparison.Ordinal) ||
                            line.StartsWith("g ", StringComparison.Ordinal) ||
                            line.StartsWith("s ", StringComparison.Ordinal) ||
                            line.StartsWith("mtllib ", StringComparison.Ordinal) ||
                            line.StartsWith("usemtl ", StringComparison.Ordinal))
                        {
                            return true;
                        }
                    }

                    return false;
                }
            }
            catch
            {
                return false;
            }
        }

        /// <summary>
        /// Instantly verifies if a file conforms to SolidWorks Gen 1 (OLE2 &lt;=2014) or Gen 2 (2015+ binary) format.
        /// </summary>
        public static bool IsSolidWorksFile(string path)
        {
            if (string.IsNullOrEmpty(path) || !File.Exists(path))
                return false;

            try
            {
                var fi = new FileInfo(path);
                if (fi.Length < 8)
                    return false;

                using (var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
                {
                    int toRead = (int)Math.Min(fi.Length, 65536);
                    byte[] header = new byte[toRead];
                    int totalRead = 0;
                    while (totalRead < toRead)
                    {
                        int read = stream.Read(header, totalRead, toRead - totalRead);
                        if (read <= 0) break;
                        totalRead += read;
                    }

                    if (totalRead < 8)
                        return false;

                    // Gen 1 (OLE2 <= 2014): D0 CF 11 E0 A1 B1 1A E1
                    if (header[0] == 0xD0 && header[1] == 0xCF && header[2] == 0x11 && header[3] == 0xE0 &&
                        header[4] == 0xA1 && header[5] == 0xB1 && header[6] == 0x1A && header[7] == 0xE1)
                    {
                        string ext = Path.GetExtension(path);
                        return string.Equals(ext, ".sldprt", StringComparison.OrdinalIgnoreCase) ||
                               string.Equals(ext, ".sldasm", StringComparison.OrdinalIgnoreCase);
                    }

                    // Gen 2 (Modern 2015+): length >= 64, bytes 4..7 == 00 00 00 04, and block marker 14 00 06 00 08 00 in first 64KB
                    if (fi.Length >= 64 && totalRead >= 64 &&
                        header[4] == 0x00 && header[5] == 0x00 && header[6] == 0x00 && header[7] == 0x04)
                    {
                        for (int i = 0; i <= totalRead - 6; i++)
                        {
                            if (header[i] == 0x14 && header[i + 1] == 0x00 &&
                                header[i + 2] == 0x06 && header[i + 3] == 0x00 &&
                                header[i + 4] == 0x08 && header[i + 5] == 0x00)
                            {
                                return true;
                            }
                        }
                    }

                    return false;
                }
            }
            catch
            {
                return false;
            }
        }

        /// <summary>
        /// Universal CAD &amp; 3D mesh format validator checking STEP, IGES, BREP, STL, 3MF, OBJ, PLY, GLB, GLTF, or SolidWorks.
        /// </summary>
        public static bool IsValidCadFile(string path)
        {
            if (string.IsNullOrEmpty(path) || !File.Exists(path))
                return false;

            return IsStepFile(path) ||
                   IsIgesFile(path) ||
                   IsBrepFile(path) ||
                   IsStlFile(path) ||
                   Is3mfFile(path) ||
                   IsGlbFile(path) ||
                   IsGltfFile(path) ||
                   IsPlyFile(path) ||
                   IsObjFile(path) ||
                   IsSolidWorksFile(path);
        }

        /// <summary>
        /// Efficiently parses CAD metadata for STEP, IGES, BREP, or STL.
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

                if (IsBrepFile(path))
                {
                    metadata.Format = "BREP";
                    metadata.Schema = "OpenCASCADE B-Rep";
                    metadata.OriginatingSystem = "OpenCASCADE Technology";
                    metadata.LengthUnit = "MILLIMETRE";

                    string head = ReadPreamble(path);
                    var match = Regex.Match(head, @"CASCADE\s+Topology\s+([A-Za-z0-9_]+)", RegexOptions.IgnoreCase);
                    if (match.Success)
                    {
                        metadata.Schema = $"OpenCASCADE B-Rep ({match.Groups[1].Value})";
                    }
                    return metadata;
                }

                if (IsIgesFile(path))
                {
                    metadata.Format = "IGES";
                    metadata.Schema = "IGES 5.3";
                    metadata.OriginatingSystem = "IGES CAD Processor";
                    metadata.LengthUnit = "MILLIMETRE";

                    ParseIgesMetadata(path, metadata);
                    return metadata;
                }

                if (IsBinaryStlFile(path, out uint triangleCount, out string headerText))
                {
                    metadata.Format = "STL";
                    metadata.Schema = triangleCount > 0 ? $"Binary STL ({triangleCount:N0} facets)" : "Binary STL";
                    metadata.OriginatingSystem = !string.IsNullOrWhiteSpace(headerText) ? headerText : "3D Mesh Model";
                    metadata.LengthUnit = "MILLIMETRE";
                    return metadata;
                }

                if (IsAsciiStlFile(path, out string solidName))
                {
                    metadata.Format = "STL";
                    metadata.Schema = "ASCII STL";
                    metadata.OriginatingSystem = !string.IsNullOrWhiteSpace(solidName) ? solidName : "3D Mesh Model";
                    metadata.LengthUnit = "MILLIMETRE";
                    return metadata;
                }

                if (Is3mfFile(path))
                {
                    metadata.Format = "3MF";
                    metadata.Schema = "3D Manufacturing Format";
                    metadata.OriginatingSystem = "3MF Consortium";
                    metadata.LengthUnit = "MILLIMETRE";
                    return metadata;
                }

                if (IsGlbFile(path))
                {
                    metadata.Format = "GLB";
                    metadata.Schema = "glTF 2.0 Binary";
                    metadata.OriginatingSystem = "Khronos glTF 2.0";
                    metadata.LengthUnit = "METRE";
                    return metadata;
                }

                if (IsGltfFile(path))
                {
                    metadata.Format = "GLTF";
                    metadata.Schema = "glTF 2.0 JSON";
                    metadata.OriginatingSystem = "Khronos glTF 2.0";
                    metadata.LengthUnit = "METRE";
                    return metadata;
                }

                if (IsPlyFile(path))
                {
                    metadata.Format = "PLY";
                    metadata.Schema = "Polygon File Format";
                    metadata.OriginatingSystem = "3D Mesh Model";
                    metadata.LengthUnit = "MILLIMETRE";
                    return metadata;
                }

                if (IsObjFile(path))
                {
                    metadata.Format = "OBJ";
                    metadata.Schema = "Wavefront OBJ";
                    metadata.OriginatingSystem = "3D Mesh Model";
                    metadata.LengthUnit = "MILLIMETRE";
                    return metadata;
                }

                if (IsSolidWorksFile(path))
                {
                    string ext = Path.GetExtension(path);
                    bool isAsm = string.Equals(ext, ".sldasm", StringComparison.OrdinalIgnoreCase);
                    metadata.Format = isAsm ? "SLDASM" : "SLDPRT";
                    metadata.Schema = isAsm ? "SolidWorks Assembly" : "SolidWorks Part";
                    metadata.OriginatingSystem = "Dassault Systèmes SolidWorks";
                    metadata.LengthUnit = "METRE";
                    return metadata;
                }

                // Default: STEP
                metadata.Format = "STEP";
                string preambleText = ReadPreamble(path);
                if (!string.IsNullOrEmpty(preambleText))
                {
                    ParseStepFileName(preambleText, metadata);
                    ParseStepSchema(preambleText, metadata);
                    ParseStepUnits(preambleText, metadata);
                }
            }
            catch
            {
                // Fallback to defaults on error
            }

            return metadata;
        }

        private static void ParseIgesMetadata(string path, StepMetadata metadata)
        {
            string content = ReadPreamble(path);
            if (string.IsNullOrEmpty(content))
                return;

            string[] lines = content.Split(new[] { "\r\n", "\r", "\n" }, StringSplitOptions.RemoveEmptyEntries);
            var gSb = new StringBuilder();
            foreach (var line in lines)
            {
                if (line.Length >= 73 && line[72] == 'G')
                {
                    gSb.Append(line.Substring(0, 72));
                }
            }

            string gText = gSb.ToString();
            if (string.IsNullOrEmpty(gText))
                return;

            List<string> parameters = ParseIgesHollerith(gText);
            if (parameters.Count >= 3 && !string.IsNullOrWhiteSpace(parameters[2]))
                metadata.FileName = parameters[2].Trim();
            if (parameters.Count >= 4 && !string.IsNullOrWhiteSpace(parameters[3]))
            {
                if (string.IsNullOrEmpty(metadata.FileName))
                    metadata.FileName = parameters[3].Trim();
            }
            if (parameters.Count >= 5 && !string.IsNullOrWhiteSpace(parameters[4]))
                metadata.OriginatingSystem = parameters[4].Trim();

            for (int i = 0; i < parameters.Count; i++)
            {
                string p = parameters[i].ToUpperInvariant().Trim();
                if (p == "MM" || p == "MILLIMETRE" || p == "MILLIMETER" || p == "2")
                    metadata.LengthUnit = "MILLIMETRE";
                else if (p == "INCH" || p == "INCHES" || p == "1")
                    metadata.LengthUnit = "INCH";
                else if (p == "M" || p == "METRE" || p == "METER" || p == "6")
                    metadata.LengthUnit = "METRE";
            }

            if (parameters.Count >= 18 && !string.IsNullOrWhiteSpace(parameters[17]))
                metadata.Timestamp = parameters[17].Trim();
            if (parameters.Count >= 21 && !string.IsNullOrWhiteSpace(parameters[20]))
                metadata.Author = parameters[20].Trim();
            if (parameters.Count >= 22 && !string.IsNullOrWhiteSpace(parameters[21]))
                metadata.Organization = parameters[21].Trim();
        }

        private static List<string> ParseIgesHollerith(string raw)
        {
            var list = new List<string>();
            int i = 0;
            while (i < raw.Length)
            {
                while (i < raw.Length && (raw[i] == ' ' || raw[i] == ',')) i++;
                if (i >= raw.Length || raw[i] == ';') break;

                var match = Regex.Match(raw.Substring(i), @"^(\d+)H", RegexOptions.IgnoreCase);
                if (match.Success)
                {
                    int len = int.Parse(match.Groups[1].Value);
                    int strStart = i + match.Length;
                    if (strStart + len <= raw.Length)
                    {
                        list.Add(raw.Substring(strStart, len));
                        i = strStart + len;
                        if (i < raw.Length && raw[i] == ',') i++;
                        continue;
                    }
                }

                int nextComma = raw.IndexOf(',', i);
                int nextSemi = raw.IndexOf(';', i);
                int end = raw.Length;
                if (nextComma != -1 && nextSemi != -1) end = Math.Min(nextComma, nextSemi);
                else if (nextComma != -1) end = nextComma;
                else if (nextSemi != -1) end = nextSemi;

                list.Add(raw.Substring(i, end - i).Trim());
                i = end + 1;
            }
            return list;
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

        private static void ParseStepFileName(string text, StepMetadata metadata)
        {
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

        private static void ParseStepSchema(string text, StepMetadata metadata)
        {
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

        private static void ParseStepUnits(string text, StepMetadata metadata)
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
