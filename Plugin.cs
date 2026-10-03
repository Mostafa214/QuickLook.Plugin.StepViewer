using System;
using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using QuickLook.Common.Plugin;

namespace QuickLook.Plugin.StepViewer
{
    public class Plugin : IViewer
    {
        private readonly string[] _supportedExtensions = { ".step", ".stp", ".p21", ".stpx" };
        private UIElement _currentContent;

        /// <summary>
        /// Higher priority than default viewers (0) so STEP files are exclusively routed here.
        /// </summary>
        public int Priority => 15;

        public void Init()
        {
            // Initialization logic if needed upon plugin discovery
        }

        public bool CanHandle(string path)
        {
            if (string.IsNullOrEmpty(path) || Directory.Exists(path))
                return false;

            string ext = Path.GetExtension(path);
            if (string.IsNullOrEmpty(ext))
                return false;

            bool extMatches = false;
            foreach (var supported in _supportedExtensions)
            {
                if (string.Equals(ext, supported, StringComparison.OrdinalIgnoreCase))
                {
                    extMatches = true;
                    break;
                }
            }

            if (!extMatches)
                return false;

            // Instant validation of ISO 10303-21 header (< 2ms)
            return StepMetadataParser.IsStepFile(path);
        }

        public void Prepare(string path, ContextObject context)
        {
            // Set ideal 4:3 CAD view aspect ratio fitted to user display bounds
            context.SetPreferredSizeFit(new Size(1024, 768), 0.85);
        }

        public void View(string path, ContextObject context)
        {
            Cleanup();

            context.IsBusy = true;

            var metadata = StepMetadataParser.ExtractMetadata(path);
            context.Title = metadata.GetFormattedTitle(Path.GetFileName(path));

            var viewer = new StepViewerControl();

            viewer.OnReady += (s, e) =>
            {
                context.IsBusy = false;
            };

            viewer.OnModelLoaded += (s, e) =>
            {
                context.IsBusy = false;
            };

            viewer.OnModelError += (s, err) =>
            {
                context.IsBusy = false;
            };

            // Watchdog fallback: ensure QuickLook blur overlay is never stuck indefinitely
            var watchdog = new System.Windows.Threading.DispatcherTimer
            {
                Interval = TimeSpan.FromSeconds(45)
            };
            watchdog.Tick += (s, e) =>
            {
                watchdog.Stop();
                context.IsBusy = false;
            };
            watchdog.Start();

            _currentContent = viewer;
            context.ViewerContent = viewer;

            viewer.LoadStepFile(path);
        }

        public void Cleanup()
        {
            if (_currentContent is StepViewerControl viewer)
            {
                try
                {
                    viewer.CancelCurrentOperation();
                    viewer.Dispose();
                }
                catch
                {
                    // Suppress exceptions during rapid cleanup
                }
            }
            _currentContent = null;
        }
    }
}
