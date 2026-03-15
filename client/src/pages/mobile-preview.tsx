import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Smartphone, Tablet, RotateCcw, ExternalLink } from "lucide-react";

const devices = [
  { name: "iPhone 14", width: 390, height: 844 },
  { name: "iPhone SE", width: 375, height: 667 },
  { name: "Pixel 7", width: 412, height: 915 },
  { name: "Galaxy S21", width: 360, height: 800 },
  { name: "iPad Mini", width: 768, height: 1024 },
];

export default function MobilePreviewPage() {
  const [selectedDevice, setSelectedDevice] = useState(devices[0]);
  const [isLandscape, setIsLandscape] = useState(false);
  const [previewPath, setPreviewPath] = useState("/");

  const width = isLandscape ? selectedDevice.height : selectedDevice.width;
  const height = isLandscape ? selectedDevice.width : selectedDevice.height;

  const appUrl = window.location.origin + previewPath;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-white mb-2">Mobile App Preview</h1>
          <p className="text-slate-400">Test how your app looks on different devices</p>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          <Card className="p-4 bg-slate-800/50 border-slate-700 lg:w-64">
            <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
              <Smartphone className="h-4 w-4" />
              Device
            </h3>
            <div className="space-y-2 mb-4">
              {devices.map((device) => (
                <Button
                  key={device.name}
                  variant={selectedDevice.name === device.name ? "default" : "outline"}
                  className="w-full justify-start text-sm"
                  onClick={() => setSelectedDevice(device)}
                >
                  {device.width > 500 ? <Tablet className="h-4 w-4 mr-2" /> : <Smartphone className="h-4 w-4 mr-2" />}
                  {device.name}
                </Button>
              ))}
            </div>

            <Button
              variant="outline"
              className="w-full mb-4"
              onClick={() => setIsLandscape(!isLandscape)}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              {isLandscape ? "Portrait" : "Landscape"}
            </Button>

            <h3 className="text-white font-semibold mb-2">Preview Page</h3>
            <div className="space-y-1">
              {["/", "/login", "/customer-portal", "/mining", "/marketplace"].map((path) => (
                <Button
                  key={path}
                  variant={previewPath === path ? "default" : "ghost"}
                  size="sm"
                  className="w-full justify-start text-xs"
                  onClick={() => setPreviewPath(path)}
                >
                  {path}
                </Button>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-slate-700">
              <p className="text-xs text-slate-400 mb-2">
                {selectedDevice.name}: {width}×{height}px
              </p>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => window.open(appUrl, '_blank')}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Open Full Screen
              </Button>
            </div>
          </Card>

          <div className="flex-1 flex justify-center items-start">
            <div 
              className="relative bg-black rounded-[3rem] p-3 shadow-2xl"
              style={{ width: width + 24, height: height + 24 }}
            >
              <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-24 h-6 bg-black rounded-b-2xl z-10" />
              
              <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 w-32 h-1 bg-slate-600 rounded-full" />
              
              <iframe
                src={appUrl}
                className="w-full h-full bg-white rounded-[2.5rem] overflow-hidden"
                style={{ width, height }}
                title="Mobile Preview"
              />
            </div>
          </div>
        </div>

        <div className="mt-6 text-center">
          <p className="text-slate-500 text-sm">
            Tip: You can also use browser DevTools (F12) → Toggle Device Toolbar for more options
          </p>
        </div>
      </div>
    </div>
  );
}
