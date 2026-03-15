import { useState, useCallback, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { insertLeadSchema, type InsertLead } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Truck, Trash2, Snowflake, Sparkles, Send, Camera, X, ImagePlus, Wrench, HardHat, Layers, PaintBucket } from "lucide-react";

interface QuotePhoto {
  id: string;
  dataUrl: string;
  name: string;
}

interface QuoteFormProps {
  variant?: "customer" | "employee";
  prefilledDate?: string;
  prefilledService?: string;
  prefilledPromoCode?: string;
  onSuccess?: () => void;
  showRewardsInfo?: boolean;
}

const serviceOptions = [
  { value: "residential", label: "Moving", subLabel: "Loading & Unloading", icon: Truck, color: "from-blue-600 to-blue-800" },
  { value: "junk", label: "Junk Removal", subLabel: "Haul Away", icon: Trash2, color: "from-orange-600 to-orange-800" },
  { value: "snow", label: "Snow Removal", subLabel: "Plowing & Shoveling", icon: Snowflake, color: "from-cyan-600 to-cyan-800" },
  { value: "cleaning", label: "Move In/Out", subLabel: "Cleaning", icon: Sparkles, color: "from-green-600 to-green-800" },
  { value: "handyman", label: "Handyman", subLabel: "General Repairs", icon: Wrench, color: "from-amber-600 to-amber-800" },
  { value: "demolition", label: "Light Demo", subLabel: "Demolition", icon: HardHat, color: "from-red-600 to-red-800" },
  { value: "flooring", label: "Flooring", subLabel: "Install & Repair", icon: Layers, color: "from-stone-600 to-stone-800" },
  { value: "painting", label: "Painting", subLabel: "Interior & Exterior", icon: PaintBucket, color: "from-violet-600 to-violet-800" },
];

export default function QuoteForm({ 
  variant = "customer", 
  prefilledDate = "", 
  prefilledService = "",
  prefilledPromoCode = "",
  onSuccess,
  showRewardsInfo = false
}: QuoteFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedService, setSelectedService] = useState<string>(prefilledService);
  const [photos, setPhotos] = useState<QuotePhoto[]>([]);

  const isEmployee = variant === "employee";
  const apiEndpoint = isEmployee ? "/api/leads/employee" : "/api/leads";

  const form = useForm<InsertLead>({
    resolver: zodResolver(insertLeadSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      serviceType: prefilledService,
      fromAddress: "",
      toAddress: "",
      moveDate: prefilledDate,
      propertySize: "",
      details: "",
      promoCode: prefilledPromoCode,
    },
  });

  useEffect(() => {
    if (prefilledDate) {
      form.setValue('moveDate', prefilledDate);
    }
  }, [prefilledDate, form]);

  useEffect(() => {
    if (prefilledService) {
      setSelectedService(prefilledService);
      form.setValue('serviceType', prefilledService);
    }
  }, [prefilledService, form]);

  useEffect(() => {
    if (prefilledPromoCode) {
      form.setValue('promoCode', prefilledPromoCode);
    }
  }, [prefilledPromoCode, form]);

  const handlePhotoUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    if (photos.length + files.length > 5) {
      toast({
        title: "Too many photos",
        description: "You can upload up to 5 photos.",
        variant: "destructive",
      });
      return;
    }

    Array.from(files).forEach((file) => {
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: `${file.name} is larger than 10MB.`,
          variant: "destructive",
        });
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        setPhotos((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            dataUrl,
            name: file.name,
          },
        ]);
      };
      reader.readAsDataURL(file);
    });

    event.target.value = "";
  }, [photos.length, toast]);

  const removePhoto = useCallback((id: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const submitLead = useMutation({
    mutationFn: async (data: InsertLead) => {
      const payload: Record<string, unknown> = { ...data };
      
      if (photos.length > 0) {
        payload.photos = photos.map((p) => ({
          id: p.id,
          url: p.dataUrl,
          type: "before" as const,
          timestamp: new Date().toISOString(),
        }));
      }
      
      const response = await apiRequest("POST", apiEndpoint, payload);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: isEmployee ? "Job request submitted!" : "Quote request submitted!",
        description: isEmployee 
          ? "The job has been added to the system. You'll earn rewards when it's confirmed and completed."
          : "We will contact you within 24 hours with your quote.",
      });
      
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      if (isEmployee) {
        queryClient.invalidateQueries({ queryKey: ["/api/leads/available"] });
        queryClient.invalidateQueries({ queryKey: ["/api/leads/my-jobs"] });
      }
      
      form.reset();
      setSelectedService("");
      setPhotos([]);
      
      onSuccess?.();
    },
    onError: (error: Error) => {
      if (error.message.includes('401')) return;
      toast({
        title: "Error",
        description: isEmployee 
          ? "Failed to submit job request. Please try again."
          : "Failed to submit quote request. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: InsertLead) => {
    submitLead.mutate(data);
  };

  const getServiceTitle = () => {
    const service = serviceOptions.find(s => s.value === selectedService);
    return service ? `${service.label} Quote` : (isEmployee ? "Add a Job" : "Get Your Free Quote");
  };

  const cardClasses = isEmployee 
    ? "border border-slate-700/50 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm shadow-xl overflow-hidden" 
    : "shadow-2xl bg-slate-800/50 border-slate-700";
  
  const labelClasses = isEmployee 
    ? "text-slate-200" 
    : "text-slate-200";
  
  const inputClasses = isEmployee 
    ? "bg-slate-800/50 border-slate-600 text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:ring-blue-500/20" 
    : "bg-slate-700 border-slate-600 text-white placeholder:text-slate-400";

  const errorClasses = isEmployee 
    ? "text-red-400 text-sm mt-1" 
    : "text-red-400 text-sm mt-1";

  return (
    <Card className={cardClasses}>
      {isEmployee && (
        <CardHeader className="border-b border-slate-700/50 bg-slate-800/50">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-orange-500 to-blue-500"></div>
          <CardTitle className="flex items-center gap-3 text-slate-100 text-xl">
            Job Request Details
          </CardTitle>
          <CardDescription className="text-slate-400">
            Fill out the customer's information and job details
          </CardDescription>
        </CardHeader>
      )}
      <CardContent className={isEmployee ? "pt-6" : "p-6 md:p-8"}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div>
            <Label className={`block text-sm font-medium ${labelClasses} mb-3`}>Service Type *</Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {serviceOptions.map((service) => {
                const IconComponent = service.icon;
                const isSelected = selectedService === service.value;
                return (
                  <label key={service.value} className="relative cursor-pointer">
                    <input
                      type="radio"
                      value={service.value}
                      className="peer sr-only"
                      checked={isSelected}
                      onChange={(e) => {
                        setSelectedService(e.target.value);
                        form.setValue("serviceType", e.target.value);
                      }}
                      data-testid={`radio-service-${service.value}`}
                    />
                    <div className={`p-3 border-2 rounded-xl transition-all duration-200 ${
                      isSelected 
                        ? 'border-transparent bg-gradient-to-br ' + service.color + ' shadow-lg shadow-blue-900/20 scale-[1.02]' 
                        : isEmployee 
                          ? 'border-slate-600 bg-slate-800/50 hover:border-blue-500/50 hover:bg-slate-700/50'
                          : 'border-slate-600 bg-slate-700/50 hover:border-slate-500'
                    }`}>
                      <IconComponent className={`mx-auto mb-1 h-6 w-6 ${isSelected ? 'text-white' : isEmployee ? 'text-blue-400' : 'text-slate-300'}`} />
                      <span className={`font-semibold block text-center text-xs ${isSelected ? 'text-white' : isEmployee ? 'text-slate-200' : 'text-slate-200'}`}>
                        {service.label}
                      </span>
                      <span className={`text-[10px] block text-center ${isSelected ? 'text-white/80' : isEmployee ? 'text-slate-400' : 'text-slate-400'}`}>
                        {service.subLabel}
                      </span>
                    </div>
                  </label>
                );
              })}
            </div>
            {form.formState.errors.serviceType && (
              <p className={`${errorClasses} mt-2`} data-testid="error-service-type">Please select a service type</p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="firstName" className={labelClasses}>
                {isEmployee ? "Customer First Name *" : "First Name *"}
              </Label>
              <Input
                id="firstName"
                placeholder={isEmployee ? "John" : "Enter your first name"}
                className={inputClasses}
                {...form.register("firstName")}
                data-testid="input-first-name"
              />
              {form.formState.errors.firstName && (
                <p className={errorClasses}>{form.formState.errors.firstName.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="lastName" className={labelClasses}>
                {isEmployee ? "Customer Last Name *" : "Last Name *"}
              </Label>
              <Input
                id="lastName"
                placeholder={isEmployee ? "Doe" : "Enter your last name"}
                className={inputClasses}
                {...form.register("lastName")}
                data-testid="input-last-name"
              />
              {form.formState.errors.lastName && (
                <p className={errorClasses}>{form.formState.errors.lastName.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="email" className={labelClasses}>
                {isEmployee ? "Customer Email *" : "Email Address *"}
              </Label>
              <Input
                id="email"
                type="email"
                placeholder={isEmployee ? "customer@email.com" : "your@email.com"}
                className={inputClasses}
                {...form.register("email")}
                data-testid="input-email"
              />
              {form.formState.errors.email && (
                <p className={errorClasses}>{form.formState.errors.email.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="phone" className={labelClasses}>
                {isEmployee ? "Customer Phone *" : "Phone Number *"}
              </Label>
              <Input
                id="phone"
                type="tel"
                placeholder="(555) 123-4567"
                className={inputClasses}
                {...form.register("phone")}
                data-testid="input-phone"
              />
              {form.formState.errors.phone && (
                <p className={errorClasses}>{form.formState.errors.phone.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="fromAddress" className={labelClasses}>Service Address *</Label>
              <Input
                id="fromAddress"
                placeholder="Where do you need service?"
                className={inputClasses}
                {...form.register("fromAddress")}
                data-testid="input-from-address"
              />
              {form.formState.errors.fromAddress && (
                <p className={errorClasses}>{form.formState.errors.fromAddress.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="toAddress" className={labelClasses}>Destination (if moving)</Label>
              <Input
                id="toAddress"
                placeholder="Destination address"
                className={inputClasses}
                {...form.register("toAddress")}
                data-testid="input-to-address"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="moveDate" className={labelClasses}>Preferred Date</Label>
              <Input
                id="moveDate"
                type="date"
                className={inputClasses}
                {...form.register("moveDate")}
                data-testid="input-move-date"
              />
            </div>
            <div>
              <Label htmlFor="propertySize" className={labelClasses}>Property Size</Label>
              <Select onValueChange={(value) => form.setValue("propertySize", value)} data-testid="select-property-size">
                <SelectTrigger className={inputClasses}>
                  <SelectValue placeholder="Select size" />
                </SelectTrigger>
                <SelectContent className={isEmployee ? "bg-slate-800 border-slate-600" : "bg-slate-700 border-slate-600"}>
                  <SelectItem value="studio" className={isEmployee ? "text-slate-200 focus:bg-slate-700" : ""}>Studio/1 BR</SelectItem>
                  <SelectItem value="2br" className={isEmployee ? "text-slate-200 focus:bg-slate-700" : ""}>2-3 Bedroom</SelectItem>
                  <SelectItem value="4br" className={isEmployee ? "text-slate-200 focus:bg-slate-700" : ""}>4+ Bedroom</SelectItem>
                  <SelectItem value="office" className={isEmployee ? "text-slate-200 focus:bg-slate-700" : ""}>Small Office</SelectItem>
                  <SelectItem value="large-office" className={isEmployee ? "text-slate-200 focus:bg-slate-700" : ""}>Large Office</SelectItem>
                  <SelectItem value="driveway" className={isEmployee ? "text-slate-200 focus:bg-slate-700" : ""}>Driveway</SelectItem>
                  <SelectItem value="parking-lot" className={isEmployee ? "text-slate-200 focus:bg-slate-700" : ""}>Parking Lot</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="details" className={labelClasses}>Additional Details</Label>
            <Textarea
              id="details"
              rows={4}
              placeholder="Tell us more about what you need... (special items, stairs, parking, etc.)"
              className={inputClasses}
              {...form.register("details")}
              data-testid="textarea-details"
            />
          </div>

          <div>
            <Label htmlFor="promoCode" className={labelClasses}>Promo Code (optional)</Label>
            <Input
              id="promoCode"
              placeholder="Enter promo code for savings"
              className={inputClasses}
              {...form.register("promoCode")}
              data-testid="input-promo-code"
            />
          </div>

          <div>
            <Label className={`${labelClasses} mb-3 block`}>
              <Camera className="inline-block mr-2 h-4 w-4 text-blue-400" />
              Add Photos (optional)
            </Label>
            <p className={`${isEmployee ? 'text-slate-400' : 'text-slate-400'} text-sm mb-3`}>
              Upload up to 5 photos to help {isEmployee ? 'assess the job' : 'us provide an accurate quote'}.
            </p>
            
            {photos.length > 0 && (
              <div className="grid grid-cols-3 gap-3 mb-4">
                {photos.map((photo) => (
                  <div key={photo.id} className={`relative aspect-square rounded-xl overflow-hidden ${isEmployee ? 'bg-slate-800 ring-2 ring-slate-700' : 'bg-slate-700'}`}>
                    <img
                      src={photo.dataUrl}
                      alt={photo.name}
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removePhoto(photo.id)}
                      className="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 shadow-lg transition-colors"
                      data-testid={`button-remove-photo-${photo.id}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {photos.length < 5 && (
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handlePhotoUpload}
                  className="hidden"
                  data-testid="input-photo-upload"
                />
                <div className={`flex items-center justify-center gap-2 p-4 border-2 border-dashed rounded-xl transition-colors ${
                  isEmployee 
                    ? 'border-slate-600 hover:border-blue-500/50 hover:bg-slate-700/50' 
                    : 'border-slate-600 hover:border-primary hover:bg-slate-700/50'
                }`}>
                  <ImagePlus className={`h-6 w-6 ${isEmployee ? 'text-slate-400' : 'text-slate-400'}`} />
                  <span className={isEmployee ? 'text-slate-400' : 'text-slate-300'}>
                    {photos.length === 0 ? "Tap to add photos" : `Add more photos (${5 - photos.length} remaining)`}
                  </span>
                </div>
              </label>
            )}
          </div>

          <Button
            type="submit"
            className={isEmployee 
              ? "w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white shadow-lg shadow-orange-500/25 py-6 text-lg font-bold" 
              : "w-full bg-gradient-to-r from-primary to-blue-600 hover:from-primary/90 hover:to-blue-600/90 text-white px-8 py-4 text-lg font-semibold shadow-lg"
            }
            disabled={submitLead.isPending}
            data-testid="button-submit-quote"
          >
            <Send className="mr-2 h-5 w-5" />
            {submitLead.isPending 
              ? "Submitting..." 
              : isEmployee 
                ? "Submit Job Request" 
                : "Request Free Quote"
            }
          </Button>
        </form>
      </CardContent>

      {showRewardsInfo && (
        <div className="mx-6 mb-6 p-4 bg-gradient-to-r from-blue-500/10 to-orange-500/10 border border-blue-500/30 rounded-xl">
          <h3 className="font-bold mb-2 text-slate-100 flex items-center gap-2">
            <span className="text-orange-400">💰</span> Earn Rewards
          </h3>
          <p className="text-sm text-slate-400">
            When jobs you create are confirmed and completed, you'll earn JCMOVES tokens as a reward for bringing in business!
          </p>
        </div>
      )}

      {!isEmployee && (
        <div className="mx-6 mb-6 rounded-xl overflow-hidden border border-orange-500/25"
          style={{ background: "linear-gradient(135deg,#0c0a09 0%,#1a1000 60%,#0c0a09 100%)" }}>
          <div className="px-4 pt-3 pb-1 flex items-center gap-2 border-b border-orange-500/15">
            <span className="text-base">🏆</span>
            <span className="text-sm font-black text-white tracking-tight">Earn JCMOVES on This Service</span>
          </div>
          <div className="px-4 py-3 space-y-2">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-yellow-400">50</span>
              <span className="text-sm text-orange-300/80 font-medium">JCMOVES per $1 spent</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Every dollar you spend on moving, junk removal, or any service earns JCMOVES tokens — redeemable for discounts, Quantum Spin prizes, and lottery tickets. Free to join.
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {["10% off coupons", "Quantum Spin prizes", "Lottery tickets", "Cash-back credits"].map(b => (
                <span key={b} className="text-[10px] bg-orange-950/60 text-orange-300 border border-orange-500/20 rounded-full px-2 py-0.5 font-medium">{b}</span>
              ))}
            </div>
            <a
              href="/login"
              className="mt-2 flex items-center justify-center gap-2 w-full py-2 rounded-lg bg-orange-500/15 border border-orange-500/30 text-orange-400 text-xs font-bold hover:bg-orange-500/25 transition-colors"
            >
              <span>Create a free account to start earning →</span>
            </a>
          </div>
        </div>
      )}
    </Card>
  );
}

export { serviceOptions };
