import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Truck, Trash2, Snowflake, Wrench, MapPin, Calendar, FileText,
  CheckCircle, Coins, Loader2, ChevronRight, Camera, X, Image, Video, Upload
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";

const SERVICES = [
  { value: "residential", label: "Moving", sub: "Local & long distance", icon: Truck, color: "bg-blue-50 dark:bg-blue-900/20 text-blue-600 border-blue-200 dark:border-blue-800" },
  { value: "junk", label: "Junk Removal", sub: "Haul away & disposal", icon: Trash2, color: "bg-orange-50 dark:bg-orange-900/20 text-orange-600 border-orange-200 dark:border-orange-800" },
  { value: "snow", label: "Snow Removal", sub: "Plowing & shoveling", icon: Snowflake, color: "bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600 border-cyan-200 dark:border-cyan-800" },
  { value: "handyman", label: "Handyman", sub: "General repairs", icon: Wrench, color: "bg-amber-50 dark:bg-amber-900/20 text-amber-600 border-amber-200 dark:border-amber-800" },
];

const ESTIMATED_TOKENS = 50;

interface UploadedMedia {
  url: string;
  mimeType: string;
  name: string;
  localPreview?: string;
}

export default function PostJobPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    serviceType: "",
    fromAddress: "",
    toAddress: "",
    moveDate: "",
    details: "",
  });
  const [media, setMedia] = useState<UploadedMedia[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    if (media.length + files.length > 6) {
      toast({ title: "Max 6 files", description: "You can attach up to 6 photos or videos.", variant: "destructive" });
      return;
    }

    setUploading(true);
    for (const file of files) {
      try {
        const localPreview = URL.createObjectURL(file);
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/leads/upload", {
          method: "POST",
          body: formData,
          credentials: "include",
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Upload failed");
        }
        const data = await res.json();
        setMedia(prev => [...prev, { url: data.url, mimeType: data.mimeType, name: data.name, localPreview }]);
      } catch (err: any) {
        toast({ title: "Upload failed", description: err.message, variant: "destructive" });
      }
    }
    setUploading(false);
    if (e.target) e.target.value = "";
  };

  const removeMedia = (idx: number) => {
    setMedia(prev => {
      const copy = [...prev];
      const item = copy.splice(idx, 1)[0];
      if (item.localPreview) URL.revokeObjectURL(item.localPreview);
      return copy;
    });
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/leads/marketplace", {
        firstName: user?.firstName || "Customer",
        lastName: user?.lastName || "",
        email: user?.email || "",
        phone: user?.phoneNumber || "",
        serviceType: form.serviceType,
        fromAddress: form.fromAddress,
        toAddress: form.toAddress || undefined,
        moveDate: form.moveDate || undefined,
        details: form.details || undefined,
        photos: media.map(m => ({ url: m.url, mimeType: m.mimeType, name: m.name })),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads/my-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads/available"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rewards/wallet"] });
      setStep(4);
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const selectedService = SERVICES.find(s => s.value === form.serviceType);

  if (step === 4) {
    return (
      <div className="min-h-screen bg-jc-cream dark:bg-zinc-950 flex items-center justify-center px-6">
        <div className="max-w-[390px] w-full text-center">
          <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="h-10 w-10 text-green-600" />
          </div>
          <h1 className="text-2xl font-black text-zinc-900 dark:text-white mb-2">Job Posted!</h1>
          <p className="text-zinc-500 dark:text-zinc-400 mb-6">
            Your {selectedService?.label || "service"} request has been submitted. We'll match you with a crew soon.
          </p>
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 p-4 mb-6 shadow-sm">
            <div className="flex items-center justify-center gap-2">
              <Coins className="h-5 w-5 text-jc-orange" />
              <span className="text-lg font-black text-jc-orange">+{ESTIMATED_TOKENS} JCMOVES</span>
            </div>
            <p className="text-xs text-zinc-400 mt-1">Earned for posting this job</p>
          </div>
          <button
            onClick={() => setLocation("/")}
            className="w-full h-14 rounded-2xl bg-jc-orange text-white font-bold text-lg shadow-lg shadow-jc-orange/30 hover:bg-jc-orange/90 active:scale-[0.98] transition-all"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-jc-cream dark:bg-zinc-950 pb-24">
      <div className="max-w-[430px] mx-auto px-4 pt-6">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => step > 1 ? setStep(s => s - 1) : setLocation("/")}
            aria-label="Go back"
            className="w-10 h-10 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 flex items-center justify-center text-zinc-600 dark:text-zinc-400 shadow-sm"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-black text-zinc-900 dark:text-white">Post a Job</h1>
            <p className="text-xs text-zinc-400">Step {step} of 3</p>
          </div>
        </div>

        <div className="flex gap-1.5 mb-6">
          {[1, 2, 3].map(s => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors ${
                s <= step ? "bg-jc-orange" : "bg-zinc-200 dark:bg-zinc-800"
              }`}
            />
          ))}
        </div>

        {step === 1 && (
          <div>
            <h2 className="font-bold text-zinc-900 dark:text-white mb-4">What do you need?</h2>
            <div className="space-y-3">
              {SERVICES.map(({ value, label, sub, icon: Icon, color }) => (
                <button
                  key={value}
                  onClick={() => { set("serviceType", value); setStep(2); }}
                  className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all active:scale-[0.98] ${
                    form.serviceType === value
                      ? "border-jc-orange bg-jc-orange/5"
                      : "border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900"
                  }`}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="text-left flex-1">
                    <p className="font-semibold text-zinc-900 dark:text-white">{label}</p>
                    <p className="text-xs text-zinc-400">{sub}</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-zinc-300 dark:text-zinc-600" />
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <h2 className="font-bold text-zinc-900 dark:text-white">Job Details</h2>

            <div>
              <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                <MapPin className="h-4 w-4 inline mr-1" /> Location / Address
              </label>
              <input
                type="text"
                placeholder="123 Main St, Ironwood, MI"
                required
                value={form.fromAddress}
                onChange={e => set("fromAddress", e.target.value)}
                className="w-full h-13 px-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white placeholder:text-zinc-400 text-base focus:outline-none focus:ring-2 focus:ring-jc-orange/30 focus:border-jc-orange transition-all"
              />
            </div>

            {form.serviceType === "residential" && (
              <div>
                <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                  Delivery Address
                </label>
                <input
                  type="text"
                  placeholder="456 Oak Ave, Green Bay, WI"
                  value={form.toAddress}
                  onChange={e => set("toAddress", e.target.value)}
                  className="w-full h-13 px-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white placeholder:text-zinc-400 text-base focus:outline-none focus:ring-2 focus:ring-jc-orange/30 focus:border-jc-orange transition-all"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                <Calendar className="h-4 w-4 inline mr-1" /> Preferred Date
              </label>
              <input
                type="date"
                value={form.moveDate}
                onChange={e => set("moveDate", e.target.value)}
                className="w-full h-13 px-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white text-base focus:outline-none focus:ring-2 focus:ring-jc-orange/30 focus:border-jc-orange transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                <FileText className="h-4 w-4 inline mr-1" /> Additional Notes
              </label>
              <textarea
                placeholder="Describe what you need help with..."
                rows={3}
                value={form.details}
                onChange={e => set("details", e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white placeholder:text-zinc-400 text-base focus:outline-none focus:ring-2 focus:ring-jc-orange/30 focus:border-jc-orange transition-all resize-none"
              />
            </div>

            {/* Photo / Video Upload */}
            <div>
              <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                <Camera className="h-4 w-4 inline mr-1" /> Photos / Videos
                <span className="text-zinc-400 font-normal ml-1">(optional, up to 6)</span>
              </label>

              {media.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {media.map((m, idx) => (
                    <div key={idx} className="relative w-20 h-20 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 flex-shrink-0">
                      {m.mimeType.startsWith("video/") ? (
                        <div className="w-full h-full flex items-center justify-center">
                          <Video className="h-7 w-7 text-zinc-400" />
                          <span className="absolute bottom-1 left-1 text-[9px] text-zinc-500 truncate max-w-[60px]">{m.name}</span>
                        </div>
                      ) : (
                        <img src={m.localPreview || m.url} alt={m.name} className="w-full h-full object-cover" />
                      )}
                      <button
                        onClick={() => removeMedia(idx)}
                        className="absolute top-1 right-1 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center"
                        aria-label="Remove"
                      >
                        <X className="h-3 w-3 text-white" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                multiple
                className="hidden"
                onChange={handleFileSelect}
              />

              {media.length < 6 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full h-12 rounded-xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 flex items-center justify-center gap-2 text-zinc-500 dark:text-zinc-400 hover:border-jc-orange hover:text-jc-orange transition-colors disabled:opacity-60"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Uploading...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" />
                      <span className="text-sm font-medium">Add Photos or Videos</span>
                    </>
                  )}
                </button>
              )}
            </div>

            <button
              onClick={() => {
                if (!form.fromAddress) {
                  toast({ title: "Location required", description: "Please enter a location.", variant: "destructive" });
                  return;
                }
                setStep(3);
              }}
              className="w-full h-14 rounded-2xl bg-jc-orange text-white font-bold text-lg shadow-lg shadow-jc-orange/30 hover:bg-jc-orange/90 active:scale-[0.98] transition-all"
            >
              Review
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="font-bold text-zinc-900 dark:text-white">Confirm Your Job</h2>

            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 p-4 shadow-sm space-y-3">
              <div className="flex items-center gap-3">
                {selectedService && (
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${selectedService.color}`}>
                    <selectedService.icon className="h-5 w-5" />
                  </div>
                )}
                <div>
                  <p className="font-semibold text-zinc-900 dark:text-white">{selectedService?.label}</p>
                  <p className="text-xs text-zinc-400">{selectedService?.sub}</p>
                </div>
              </div>

              <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3 space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-zinc-400 mt-0.5 flex-shrink-0" />
                  <span className="text-zinc-700 dark:text-zinc-300">{form.fromAddress}</span>
                </div>
                {form.toAddress && (
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-zinc-700 dark:text-zinc-300">{form.toAddress}</span>
                  </div>
                )}
                {form.moveDate && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-zinc-400" />
                    <span className="text-zinc-700 dark:text-zinc-300">{new Date(form.moveDate).toLocaleDateString()}</span>
                  </div>
                )}
                {form.details && (
                  <div className="flex items-start gap-2">
                    <FileText className="h-4 w-4 text-zinc-400 mt-0.5 flex-shrink-0" />
                    <span className="text-zinc-700 dark:text-zinc-300">{form.details}</span>
                  </div>
                )}
                {media.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Image className="h-4 w-4 text-zinc-400" />
                    <span className="text-zinc-700 dark:text-zinc-300">{media.length} photo{media.length !== 1 ? "s" : ""}/video{media.length !== 1 ? "s" : ""} attached</span>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-jc-orange/5 border border-jc-orange/20 rounded-2xl p-4 flex items-center gap-3">
              <Coins className="h-6 w-6 text-jc-orange flex-shrink-0" />
              <div>
                <p className="text-sm font-bold text-zinc-900 dark:text-white">Earn +{ESTIMATED_TOKENS} JCMOVES</p>
                <p className="text-xs text-zinc-500">Tokens awarded when your job is posted</p>
              </div>
            </div>

            <button
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending}
              className="w-full h-14 rounded-2xl bg-jc-orange text-white font-bold text-lg shadow-lg shadow-jc-orange/30 hover:bg-jc-orange/90 active:scale-[0.98] transition-all disabled:opacity-60"
            >
              {submitMutation.isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" /> Posting...
                </span>
              ) : (
                "Submit Job"
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
