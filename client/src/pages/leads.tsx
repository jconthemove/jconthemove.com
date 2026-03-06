import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { ArrowLeft, Home, Building, Trash2, Mail, Phone, CircleDot, MessageCircle, FileText, CheckCircle, Clock, Play, Activity, CheckCheck, Settings, MapPin, Calendar as CalendarIcon, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { insertLeadSchema, type InsertLead, type Lead, type User } from "@shared/schema";
import { useAuth } from "@/hooks/useAuth";
import { LeadQuoteDialog } from "@/components/LeadQuoteDialog";

export default function LeadsPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const isStaff = ["admin", "business_owner", "employee"].includes(currentUser?.role || "");
  const [selectedService, setSelectedService] = useState("");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isQuickViewOpen, setIsQuickViewOpen] = useState(false);
  const [isManageDialogOpen, setIsManageDialogOpen] = useState(false);
  const [leadToDelete, setLeadToDelete] = useState<Lead | null>(null);

  const serviceOptions = [
    { value: "residential", label: "Residential Moving", icon: Home },
    { value: "commercial", label: "Commercial Moving", icon: Building },
    { value: "junk", label: "Junk Removal", icon: Trash2 },
  ];

  // Fetch all leads (always fetch fresh to avoid showing deleted leads)
  const { data: leads = [], isLoading } = useQuery<Lead[]>({
    queryKey: ["/api/leads"],
    staleTime: 0, // Always fetch fresh data
    refetchOnMount: true,
  });

  // Fetch employees
  const { data: employees = [] } = useQuery<User[]>({
    queryKey: ["/api/employees"],
    enabled: isManageDialogOpen,
  });

  // Find created by user from employees list
  const createdByUser = employees.find(emp => emp.id === selectedLead?.createdByUserId);

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
      const response = await apiRequest("POST", "/api/leads/employee", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Lead added successfully!",
        description: "The lead has been added to the system. You'll earn rewards when it's confirmed and completed.",
      });
      form.reset();
      setSelectedService("");
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads/available"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add lead. Please try again.",
        variant: "destructive",
      });
    },
  });

  const saveQuote = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("PATCH", `/api/leads/${selectedLead?.id}/quote`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Quote saved successfully!",
        description: "The quote has been updated for this lead.",
      });
      setIsManageDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads/status/quoted"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save quote. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteLead = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/leads/${id}`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Lead deleted",
        description: "The lead has been permanently deleted.",
      });
      setLeadToDelete(null);
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete lead. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = form.handleSubmit((data) => {
    submitLead.mutate(data);
  });

  const handleSaveQuote = (data: any) => {
    saveQuote.mutate(data);
  };

  const getServiceBadgeColor = (serviceType: string) => {
    switch (serviceType) {
      case "residential": return "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200";
      case "commercial": return "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200";
      case "junk": return "bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200";
      default: return "bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200";
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "new": return "default";
      case "contacted": return "secondary";
      case "quoted": return "secondary";
      case "confirmed": return "default";
      default: return "secondary";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "new": return <CircleDot className="h-4 w-4 text-blue-500" />;
      case "contacted": return <MessageCircle className="h-4 w-4 text-purple-500" />;
      case "quoted": return <FileText className="h-4 w-4 text-amber-500" />;
      case "confirmed": return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "available": return <Clock className="h-4 w-4 text-orange-500" />;
      case "accepted": return <Play className="h-4 w-4 text-teal-500" />;
      case "in_progress": return <Activity className="h-4 w-4 text-indigo-500" />;
      case "completed": return <CheckCheck className="h-4 w-4 text-emerald-500" />;
      default: return <CircleDot className="h-4 w-4 text-gray-500" />;
    }
  };

  const handleViewLead = (lead: Lead) => {
    setSelectedLead(lead);
    setIsQuickViewOpen(true);
  };

  const handleManageJob = (lead: Lead) => {
    setSelectedLead(lead);
    setIsQuickViewOpen(false);
    setIsManageDialogOpen(true);
  };

  const renderLeadCard = (lead: Lead) => (
    <Card
      key={lead.id}
      className="border border-slate-700 hover:border-blue-500/60 hover:shadow-xl transition-all bg-slate-800/80 backdrop-blur-sm cursor-pointer group"
      data-testid={`lead-card-${lead.id}`}
      onClick={() => setLocation(`/lead/${lead.id}`)}
    >
      <CardContent className="p-5">
        <div className="space-y-4">
          {/* Header row with name and status */}
          <div className="flex justify-between items-start flex-wrap gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              {getStatusIcon(lead.status)}
              <h3 className="font-bold text-lg text-white group-hover:text-blue-300 transition-colors">
                {lead.firstName} {lead.lastName}
              </h3>
              <Badge className={getServiceBadgeColor(lead.serviceType)}>
                {lead.serviceType === "residential" && "Residential"}
                {lead.serviceType === "commercial" && "Commercial"}
                {lead.serviceType === "junk" && "Junk Removal"}
                {!["residential","commercial","junk"].includes(lead.serviceType) && lead.serviceType.charAt(0).toUpperCase() + lead.serviceType.slice(1)}
              </Badge>
              <Badge variant={getStatusBadgeVariant(lead.status)}>
                {lead.status.charAt(0).toUpperCase() + lead.status.slice(1).replace("_", " ")}
              </Badge>
              {lead.redemptionId && (
                <Badge className="bg-orange-500/20 text-orange-400 border border-orange-500/30">
                  🎁 From Rewards
                </Badge>
              )}
            </div>
            <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
              <Button 
                variant="default" 
                size="sm" 
                onClick={() => setLocation(`/lead/${lead.id}`)}
                data-testid={`manage-button-${lead.id}`}
                className="gap-1.5"
              >
                <ChevronRight className="h-3.5 w-3.5" />
                Open
              </Button>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setLeadToDelete(lead)}
                data-testid={`delete-button-${lead.id}`}
                className="hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          {/* Contact info row */}
          <div className="flex flex-wrap gap-4 text-sm" onClick={(e) => e.stopPropagation()}>
            <Button variant="outline" size="sm" asChild data-testid={`email-button-${lead.id}`} className="h-8">
              <a href={`mailto:${lead.email}`} className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                {lead.email}
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild data-testid={`phone-button-${lead.id}`} className="h-8">
              <a href={`tel:${lead.phone}`} className="flex items-center gap-2">
                <Phone className="h-4 w-4" />
                {lead.phone}
              </a>
            </Button>
          </div>
          
          {/* Location and date info */}
          <div className="space-y-2 text-sm text-slate-300">
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 mt-0.5 text-slate-400 flex-shrink-0" />
              <div className="space-y-1">
                <p className="font-medium text-white">From: {lead.fromAddress}</p>
                {lead.toAddress && <p className="font-medium text-white">To: {lead.toAddress}</p>}
              </div>
            </div>
            {lead.moveDate && (
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-slate-400" />
                <p className="text-slate-300">Move Date: <span className="font-medium text-white">{lead.moveDate}</span></p>
              </div>
            )}
          </div>
          
          {/* Details section */}
          {lead.details && (
            <div className="bg-slate-700/50 p-3 rounded-lg">
              <p className="text-sm text-slate-300">{lead.details}</p>
            </div>
          )}
          
          {/* Footer with timestamp */}
          <p className="text-xs text-slate-400 border-t border-slate-700 pt-2">
            Posted: {new Date(lead.createdAt).toLocaleString()}
          </p>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      <div className="min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-8">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h1 className="text-4xl font-bold text-white">Management</h1>
                <p className="text-slate-300 mt-2 text-lg">
                  View and manage customer leads
                </p>
              </div>
              <Button
                variant="ghost"
                onClick={() => setLocation("/dashboard")}
                className="flex items-center gap-2 text-white/70 hover:text-white hover:bg-white/10"
                data-testid="button-back-to-dashboard"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Dashboard
              </Button>
            </div>
          </div>

          <Tabs defaultValue="view" className="space-y-6">
            <TabsList className="bg-slate-800/80 border border-slate-700">
              <TabsTrigger value="view" data-testid="tab-view-leads">Active Leads</TabsTrigger>
              <TabsTrigger value="completed" data-testid="tab-completed-leads" className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
                Completed ({leads.filter(l => l.status === 'completed').length})
              </TabsTrigger>
              <TabsTrigger value="add" data-testid="tab-add-lead">+ Book a Job</TabsTrigger>
            </TabsList>

            <TabsContent value="view">
              {isLoading ? (
                <Card className="bg-slate-800/50 border-slate-700">
                  <CardContent className="text-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto"></div>
                    <p className="mt-4 text-slate-400">Loading leads...</p>
                  </CardContent>
                </Card>
              ) : leads.filter(l => l.status !== 'completed').length === 0 ? (
                <Card className="bg-slate-800/50 border-slate-700">
                  <CardContent className="py-12">
                    <div className="text-center">
                      <p className="text-slate-400">No active leads at this time.</p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card className="bg-slate-800/50 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-2xl text-white">Active Leads ({leads.filter(l => l.status !== 'completed').length})</CardTitle>
                    <CardDescription className="text-slate-400">Customer leads in progress</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {[...leads]
                        .filter(l => l.status !== 'completed')
                        .sort((a, b) => {
                          const statusOrder = ["new", "contacted", "quoted", "confirmed", "available", "accepted", "in_progress"];
                          const aIndex = statusOrder.indexOf(a.status);
                          const bIndex = statusOrder.indexOf(b.status);
                          if (aIndex !== bIndex) return aIndex - bIndex;
                          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                        })
                        .map(renderLeadCard)}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="completed">
              {isLoading ? (
                <Card className="bg-slate-800/50 border-slate-700">
                  <CardContent className="text-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto"></div>
                    <p className="mt-4 text-slate-400">Loading completed jobs...</p>
                  </CardContent>
                </Card>
              ) : leads.filter(l => l.status === 'completed').length === 0 ? (
                <Card className="bg-slate-800/50 border-slate-700">
                  <CardContent className="py-12">
                    <div className="text-center">
                      <CheckCheck className="h-12 w-12 text-slate-600 mx-auto mb-3" />
                      <p className="text-slate-400">No completed jobs yet.</p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card className="bg-slate-800/50 border-emerald-800/30">
                  <CardHeader>
                    <CardTitle className="text-2xl text-white flex items-center gap-2">
                      <CheckCheck className="h-6 w-6 text-emerald-500" />
                      Completed Jobs ({leads.filter(l => l.status === 'completed').length})
                    </CardTitle>
                    <CardDescription className="text-slate-400">Jobs that have been finished</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {[...leads]
                        .filter(l => l.status === 'completed')
                        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                        .map(renderLeadCard)}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="add">
              <Card className="bg-slate-800/50 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-2xl text-white">
                    {isStaff ? "Create a New Job" : "Book a Service"}
                  </CardTitle>
                  <CardDescription className="text-slate-400">
                    {isStaff
                      ? "Create a job on behalf of a customer — phone call, walk-in, or referral. You'll earn rewards when the job is confirmed and completed."
                      : "Book a moving, junk removal, or other service directly. Your job goes straight into our pipeline and you earn JCMOVES tokens when it's completed. You can track your order here anytime."}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={onSubmit} className="space-y-6">
                    <div>
                      <Label className="block text-sm font-medium text-slate-300 mb-3">Service Type *</Label>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {serviceOptions.map((service) => {
                          const IconComponent = service.icon;
                          return (
                            <label key={service.value} className="relative">
                              <input
                                type="radio"
                                value={service.value}
                                className="peer sr-only"
                                {...form.register("serviceType", { required: true })}
                                onChange={(e) => setSelectedService(e.target.value)}
                                data-testid={`radio-service-${service.value}`}
                              />
                              <div className="p-4 border-2 border-slate-600 rounded-lg cursor-pointer peer-checked:border-orange-500 peer-checked:bg-orange-500/10 transition-colors bg-slate-700/30">
                                <IconComponent className="text-orange-400 text-2xl mb-2 mx-auto h-8 w-8" />
                                <span className="font-medium block text-center text-white">{service.label}</span>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                      {form.formState.errors.serviceType && (
                        <p className="text-destructive text-sm mt-1" data-testid="error-service-type">Service type is required</p>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <Label htmlFor="firstName" className="text-slate-300">Customer First Name *</Label>
                        <Input
                          id="firstName"
                          placeholder="John"
                          className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500"
                          {...form.register("firstName")}
                          data-testid="input-first-name"
                        />
                        {form.formState.errors.firstName && (
                          <p className="text-destructive text-sm mt-1" data-testid="error-first-name">{form.formState.errors.firstName.message}</p>
                        )}
                      </div>
                      <div>
                        <Label htmlFor="lastName" className="text-slate-300">Customer Last Name *</Label>
                        <Input
                          id="lastName"
                          placeholder="Doe"
                          className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500"
                          {...form.register("lastName")}
                          data-testid="input-last-name"
                        />
                        {form.formState.errors.lastName && (
                          <p className="text-destructive text-sm mt-1" data-testid="error-last-name">{form.formState.errors.lastName.message}</p>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <Label htmlFor="email" className="text-slate-300">Customer Email *</Label>
                        <Input
                          id="email"
                          type="email"
                          placeholder="customer@email.com"
                          className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500"
                          {...form.register("email")}
                          data-testid="input-email"
                        />
                        {form.formState.errors.email && (
                          <p className="text-destructive text-sm mt-1" data-testid="error-email">{form.formState.errors.email.message}</p>
                        )}
                      </div>
                      <div>
                        <Label htmlFor="phone" className="text-slate-300">Customer Phone *</Label>
                        <Input
                          id="phone"
                          type="tel"
                          placeholder="(555) 123-4567"
                          className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500"
                          {...form.register("phone")}
                          data-testid="input-phone"
                        />
                        {form.formState.errors.phone && (
                          <p className="text-destructive text-sm mt-1" data-testid="error-phone">{form.formState.errors.phone.message}</p>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <Label htmlFor="fromAddress" className="text-slate-300">From Address *</Label>
                        <Input
                          id="fromAddress"
                          placeholder="Current address"
                          className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500"
                          {...form.register("fromAddress")}
                          data-testid="input-from-address"
                        />
                        {form.formState.errors.fromAddress && (
                          <p className="text-destructive text-sm mt-1" data-testid="error-from-address">{form.formState.errors.fromAddress.message}</p>
                        )}
                      </div>
                      <div>
                        <Label htmlFor="toAddress" className="text-slate-300">To Address</Label>
                        <Input
                          id="toAddress"
                          placeholder="Destination address"
                          className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500"
                          {...form.register("toAddress")}
                          data-testid="input-to-address"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <Label htmlFor="moveDate" className="text-slate-300">Preferred Move Date</Label>
                        <Input
                          id="moveDate"
                          type="date"
                          className="bg-slate-700/50 border-slate-600 text-white"
                          {...form.register("moveDate")}
                          data-testid="input-move-date"
                        />
                      </div>
                      <div>
                        <Label htmlFor="propertySize" className="text-slate-300">Property Size</Label>
                        <Input
                          id="propertySize"
                          placeholder="e.g., 2 bedroom, 1500 sq ft"
                          className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500"
                          {...form.register("propertySize")}
                          data-testid="input-property-size"
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="details" className="text-slate-300">Additional Details</Label>
                      <Textarea
                        id="details"
                        placeholder="Any special requirements, items to move, or important notes..."
                        rows={4}
                        className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500"
                        {...form.register("details")}
                        data-testid="textarea-details"
                      />
                    </div>

                    <Button
                      type="submit"
                      disabled={submitLead.isPending}
                      className="w-full"
                      data-testid="button-submit-lead"
                    >
                      {submitLead.isPending ? "Submitting..." : "Add Lead"}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card className="mt-6 bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-950/30 dark:to-blue-950/30 border-green-200 dark:border-green-800">
                <CardContent className="pt-6">
                  <h3 className="font-semibold mb-2">💰 Earn Rewards</h3>
                  <p className="text-sm text-muted-foreground">
                    When leads you create are confirmed and completed, you'll earn 50% of the rewards when other employees complete the job. This encourages teamwork and business growth!
                  </p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Quick View Dialog */}
      <Dialog open={isQuickViewOpen} onOpenChange={setIsQuickViewOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Lead Details</DialogTitle>
            <DialogDescription>
              View lead information and take action
            </DialogDescription>
          </DialogHeader>
          {selectedLead && (
            <Card className="border" data-testid={`lead-quick-view-${selectedLead.id}`}>
              <CardContent className="p-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-lg">
                      {selectedLead.firstName} {selectedLead.lastName}
                    </h3>
                    <Badge
                      variant={selectedLead.status === 'completed' ? 'default' : 'secondary'}
                      className={selectedLead.status === 'completed' ? 'bg-green-600' : ''}
                    >
                      {selectedLead.status.charAt(0).toUpperCase() + selectedLead.status.slice(1).replace('_', ' ')}
                    </Badge>
                  </div>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Badge className={
                        selectedLead.serviceType === 'residential' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                        selectedLead.serviceType === 'commercial' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                        'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
                      }>
                        {selectedLead.serviceType === 'residential' ? 'Residential' : 
                         selectedLead.serviceType === 'commercial' ? 'Commercial' : 
                         'Junk Removal'}
                      </Badge>
                    </div>
                    <p className="flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      <a href={`tel:${selectedLead.phone}`} className="hover:underline">
                        {selectedLead.phone}
                      </a>
                    </p>
                    <p className="flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      <a href={`mailto:${selectedLead.email}`} className="hover:underline">
                        {selectedLead.email}
                      </a>
                    </p>
                    <p className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      {selectedLead.fromAddress}
                    </p>
                    {selectedLead.toAddress && (
                      <p className="flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        To: {selectedLead.toAddress}
                      </p>
                    )}
                    {selectedLead.moveDate && (
                      <p className="flex items-center gap-2">
                        <CalendarIcon className="h-4 w-4" />
                        Move Date: {new Date(selectedLead.moveDate).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  {selectedLead.details && (
                    <p className="text-sm mt-2 p-2 bg-muted rounded">
                      {selectedLead.details}
                    </p>
                  )}
                  <div className="flex gap-2 mt-3">
                    <Button 
                      size="sm" 
                      onClick={() => handleManageJob(selectedLead)}
                      data-testid={`button-manage-job-${selectedLead.id}`}
                    >
                      <Settings className="h-4 w-4 mr-1" />
                      Manage Job
                    </Button>
                    <Button variant="outline" size="sm" asChild data-testid={`button-call-${selectedLead.id}`}>
                      <a href={`tel:${selectedLead.phone}`}>
                        <Phone className="h-4 w-4 mr-1" />
                        Call
                      </a>
                    </Button>
                    <Button variant="outline" size="sm" asChild data-testid={`button-email-${selectedLead.id}`}>
                      <a href={`mailto:${selectedLead.email}`}>
                        <Mail className="h-4 w-4 mr-1" />
                        Email
                      </a>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </DialogContent>
      </Dialog>

      {/* Full Management Dialog */}
      <LeadQuoteDialog
        open={isManageDialogOpen}
        onOpenChange={setIsManageDialogOpen}
        lead={selectedLead}
        employees={employees}
        onSave={handleSaveQuote}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!leadToDelete} onOpenChange={(open) => !open && setLeadToDelete(null)}>
        <AlertDialogContent data-testid="dialog-delete-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the lead for{" "}
              <strong>{leadToDelete?.firstName} {leadToDelete?.lastName}</strong>.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => leadToDelete && deleteLead.mutate(leadToDelete.id)}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteLead.isPending ? "Deleting..." : "Delete Lead"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
