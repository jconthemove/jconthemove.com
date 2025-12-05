import { Card, CardContent } from "@/components/ui/card";
import { Truck, Trash2, Snowflake, Sparkles, Wrench, HardHat, Layers, PaintBucket, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function ServicesPage() {
  const services = [
    { 
      value: "residential", 
      label: "MOVING", 
      subLabel: "Loading & Unloading", 
      icon: Truck, 
      color: "from-blue-600 to-blue-800",
      borderColor: "border-blue-400/50 hover:border-blue-300",
      shadowColor: "hover:shadow-blue-500/20",
      textColor: "text-blue-100"
    },
    { 
      value: "junk", 
      label: "JUNK", 
      subLabel: "Removal", 
      icon: Trash2, 
      color: "from-orange-600 to-orange-800",
      borderColor: "border-orange-400/50 hover:border-orange-300",
      shadowColor: "hover:shadow-orange-500/20",
      textColor: "text-orange-100"
    },
    { 
      value: "snow", 
      label: "SNOW", 
      subLabel: "Removal", 
      icon: Snowflake, 
      color: "from-cyan-600 to-cyan-800",
      borderColor: "border-cyan-400/50 hover:border-cyan-300",
      shadowColor: "hover:shadow-cyan-500/20",
      textColor: "text-cyan-100"
    },
    { 
      value: "cleaning", 
      label: "MOVE IN/OUT", 
      subLabel: "Cleaning", 
      icon: Sparkles, 
      color: "from-green-600 to-green-800",
      borderColor: "border-green-400/50 hover:border-green-300",
      shadowColor: "hover:shadow-green-500/20",
      textColor: "text-green-100"
    },
    { 
      value: "handyman", 
      label: "HANDYMAN", 
      subLabel: "General Repairs", 
      icon: Wrench, 
      color: "from-amber-600 to-amber-800",
      borderColor: "border-amber-400/50 hover:border-amber-300",
      shadowColor: "hover:shadow-amber-500/20",
      textColor: "text-amber-100"
    },
    { 
      value: "demolition", 
      label: "LIGHT DEMO", 
      subLabel: "Demolition", 
      icon: HardHat, 
      color: "from-red-600 to-red-800",
      borderColor: "border-red-400/50 hover:border-red-300",
      shadowColor: "hover:shadow-red-500/20",
      textColor: "text-red-100"
    },
    { 
      value: "flooring", 
      label: "FLOORING", 
      subLabel: "Installation & Repair", 
      icon: Layers, 
      color: "from-stone-600 to-stone-800",
      borderColor: "border-stone-400/50 hover:border-stone-300",
      shadowColor: "hover:shadow-stone-500/20",
      textColor: "text-stone-100"
    },
    { 
      value: "painting", 
      label: "PAINTING", 
      subLabel: "Interior & Exterior", 
      icon: PaintBucket, 
      color: "from-violet-600 to-violet-800",
      borderColor: "border-violet-400/50 hover:border-violet-300",
      shadowColor: "hover:shadow-violet-500/20",
      textColor: "text-violet-100"
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Back Button */}
        <Link href="/">
          <Button variant="ghost" className="text-white hover:bg-white/10 mb-6" data-testid="button-back">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Button>
        </Link>

        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2" data-testid="heading-services">
            Our Services
          </h1>
          <p className="text-slate-300">
            Tap any service below to request a free quote
          </p>
        </div>

        {/* 8 Service Tiles - 2x4 Grid */}
        <div className="grid grid-cols-2 gap-4 md:gap-6">
          {services.map((service) => {
            const IconComponent = service.icon;
            return (
              <Link href={`/quote?service=${service.value}`} key={service.value}>
                <Card 
                  className={`group cursor-pointer bg-gradient-to-br ${service.color} border-2 ${service.borderColor} hover:shadow-xl ${service.shadowColor} transition-all duration-300 hover:scale-[1.02]`}
                  data-testid={`card-service-${service.value}`}
                >
                  <CardContent className="p-6 md:p-8 text-center">
                    <div className="mb-4 flex justify-center">
                      <div className="bg-white/20 p-4 rounded-full">
                        <IconComponent className="h-10 w-10 md:h-14 md:w-14 text-white" />
                      </div>
                    </div>
                    <h3 className="text-xl md:text-2xl font-bold text-white mb-2">{service.label}</h3>
                    <p className={`${service.textColor} text-sm md:text-base`}>{service.subLabel}</p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>

        {/* Contact Info */}
        <div className="mt-12 text-center text-slate-300">
          <p className="mb-2">Need immediate help?</p>
          <a href="tel:(906) 285-9312" className="text-xl font-bold text-primary hover:text-primary/80 transition-colors">
            Call (906) 285-9312
          </a>
        </div>
      </div>
    </div>
  );
}
