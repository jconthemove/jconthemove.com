import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
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
import { Card, CardContent } from "@/components/ui/card";
import { Truck, Trash2, Snowflake, Sparkles, Send, ArrowLeft, Camera, X, ImagePlus, Wrench, HardHat, Layers, PaintBucket } from "lucide-react";
import { Link } from "wouter";

interface QuotePhoto {
  id: string;
  dataUrl: string;
  name: string;
}

export default function QuotePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [location] = useLocation();
  const [selectedService, setSelectedService] = useState<string>("");
  const [photos, setPhotos] = useState<QuotePhoto[]>([]);

  // Parse service from URL query parameter
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const service = params.get('service');
    if (service) {
      setSelectedService(service);
      form.setValue("serviceType", service);
    }
  }, [location]);

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

  const form = useForm<InsertLead>({
    resolver: zodResolver(insertLeadSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      serviceType: "",
      fromAddress: "",
      toAddress: "",
      moveDate: "",
      propertySize: "",
      details: "",
    },
  });

  const submitLead = useMutation({
    mutationFn: async (data: InsertLead) => {
      const photoData = photos.map((p) => ({
        id: p.id,
        url: p.dataUrl,
        type: "before" as const,
        timestamp: new Date().toISOString(),
      }));
      const response = await apiRequest("POST", "/api/leads", {
        ...data,
        photos: photoData,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Quote request submitted!",
        description: "We will contact you within 24 hours with your quote.",
      });
      form.reset();
      setSelectedService("");
      setPhotos([]);
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
    },
    onError: (error: Error) => {
      if (error.message.includes('401')) return;
      toast({
        title: "Error",
        description: "Failed to submit quote request. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: InsertLead) => {
    submitLead.mutate(data);
  };

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

  const getServiceTitle = () => {
    const service = serviceOptions.find(s => s.value === selectedService);
    return service ? `${service.label} Quote` : "Get Your Free Quote";
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Back Button */}
        <Link href="/">
          <Button variant="ghost" className="text-white hover:bg-white/10 mb-6" data-testid="button-back">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Button>
        </Link>

        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2" data-testid="heading-quote">
            {getServiceTitle()}
          </h1>
          <p className="text-slate-300">
            Fill out the form below and we'll get back to you within 24 hours.
          </p>
        </div>
        
        <Card className="shadow-2xl bg-slate-800/50 border-slate-700">
          <CardContent className="p-6 md:p-8">
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Service Selection */}
              <div>
                <Label className="block text-sm font-medium text-white mb-3">Service Type *</Label>
                <div className="grid grid-cols-2 gap-3">
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
                        <div className={`p-4 border-2 rounded-xl transition-all duration-200 ${
                          isSelected 
                            ? 'border-primary bg-gradient-to-br ' + service.color + ' shadow-lg scale-[1.02]' 
                            : 'border-slate-600 bg-slate-700/50 hover:border-slate-500'
                        }`}>
                          <IconComponent className={`mx-auto mb-2 h-8 w-8 ${isSelected ? 'text-white' : 'text-slate-300'}`} />
                          <span className={`font-semibold block text-center text-sm ${isSelected ? 'text-white' : 'text-slate-200'}`}>
                            {service.label}
                          </span>
                          <span className={`text-xs block text-center ${isSelected ? 'text-white/80' : 'text-slate-400'}`}>
                            {service.subLabel}
                          </span>
                        </div>
                      </label>
                    );
                  })}
                </div>
                {form.formState.errors.serviceType && (
                  <p className="text-red-400 text-sm mt-2" data-testid="error-service-type">Please select a service type</p>
                )}
              </div>

              {/* Contact Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="firstName" className="text-slate-200">First Name *</Label>
                  <Input
                    id="firstName"
                    placeholder="Enter your first name"
                    className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400"
                    {...form.register("firstName")}
                    data-testid="input-first-name"
                  />
                  {form.formState.errors.firstName && (
                    <p className="text-red-400 text-sm mt-1">{form.formState.errors.firstName.message}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="lastName" className="text-slate-200">Last Name *</Label>
                  <Input
                    id="lastName"
                    placeholder="Enter your last name"
                    className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400"
                    {...form.register("lastName")}
                    data-testid="input-last-name"
                  />
                  {form.formState.errors.lastName && (
                    <p className="text-red-400 text-sm mt-1">{form.formState.errors.lastName.message}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="email" className="text-slate-200">Email Address *</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="your@email.com"
                    className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400"
                    {...form.register("email")}
                    data-testid="input-email"
                  />
                  {form.formState.errors.email && (
                    <p className="text-red-400 text-sm mt-1">{form.formState.errors.email.message}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="phone" className="text-slate-200">Phone Number *</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="(555) 123-4567"
                    className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400"
                    {...form.register("phone")}
                    data-testid="input-phone"
                  />
                  {form.formState.errors.phone && (
                    <p className="text-red-400 text-sm mt-1">{form.formState.errors.phone.message}</p>
                  )}
                </div>
              </div>

              {/* Address Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="fromAddress" className="text-slate-200">Service Address *</Label>
                  <Input
                    id="fromAddress"
                    placeholder="Where do you need service?"
                    className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400"
                    {...form.register("fromAddress")}
                    data-testid="input-from-address"
                  />
                  {form.formState.errors.fromAddress && (
                    <p className="text-red-400 text-sm mt-1">{form.formState.errors.fromAddress.message}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="toAddress" className="text-slate-200">Destination (if moving)</Label>
                  <Input
                    id="toAddress"
                    placeholder="Destination address"
                    className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400"
                    {...form.register("toAddress")}
                    data-testid="input-to-address"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="moveDate" className="text-slate-200">Preferred Date</Label>
                  <Input
                    id="moveDate"
                    type="date"
                    className="bg-slate-700 border-slate-600 text-white"
                    {...form.register("moveDate")}
                    data-testid="input-move-date"
                  />
                </div>
                <div>
                  <Label htmlFor="propertySize" className="text-slate-200">Property Size</Label>
                  <Select onValueChange={(value) => form.setValue("propertySize", value)} data-testid="select-property-size">
                    <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
                      <SelectValue placeholder="Select size" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-700 border-slate-600">
                      <SelectItem value="studio">Studio/1 BR</SelectItem>
                      <SelectItem value="2br">2-3 Bedroom</SelectItem>
                      <SelectItem value="4br">4+ Bedroom</SelectItem>
                      <SelectItem value="office">Small Office</SelectItem>
                      <SelectItem value="large-office">Large Office</SelectItem>
                      <SelectItem value="driveway">Driveway</SelectItem>
                      <SelectItem value="parking-lot">Parking Lot</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="details" className="text-slate-200">Additional Details</Label>
                <Textarea
                  id="details"
                  rows={4}
                  placeholder="Tell us more about what you need... (special items, stairs, parking, etc.)"
                  className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400"
                  {...form.register("details")}
                  data-testid="textarea-details"
                />
              </div>

              {/* Photo Upload Section */}
              <div>
                <Label className="text-slate-200 mb-3 block">
                  <Camera className="inline-block mr-2 h-4 w-4" />
                  Add Photos (optional)
                </Label>
                <p className="text-slate-400 text-sm mb-3">
                  Upload up to 5 photos to help us provide an accurate quote.
                </p>
                
                {/* Photo Preview Grid */}
                {photos.length > 0 && (
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    {photos.map((photo) => (
                      <div key={photo.id} className="relative aspect-square rounded-lg overflow-hidden bg-slate-700">
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

                {/* Upload Button */}
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
                    <div className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-slate-600 rounded-xl hover:border-primary hover:bg-slate-700/50 transition-colors">
                      <ImagePlus className="h-6 w-6 text-slate-400" />
                      <span className="text-slate-300">
                        {photos.length === 0 ? "Tap to add photos" : `Add more photos (${5 - photos.length} remaining)`}
                      </span>
                    </div>
                  </label>
                )}
              </div>

              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-primary to-blue-600 hover:from-primary/90 hover:to-blue-600/90 text-white px-8 py-4 text-lg font-semibold shadow-lg"
                disabled={submitLead.isPending}
                data-testid="button-submit-quote"
              >
                <Send className="mr-2 h-5 w-5" />
                {submitLead.isPending ? "Submitting..." : "Request Free Quote"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Contact Info */}
        <div className="mt-8 text-center text-slate-300">
          <p className="mb-2">Need immediate help?</p>
          <a href="tel:(906) 285-9312" className="text-xl font-bold text-primary hover:text-primary/80 transition-colors">
            Call (906) 285-9312
          </a>
        </div>
      </div>
    </div>
  );
}
