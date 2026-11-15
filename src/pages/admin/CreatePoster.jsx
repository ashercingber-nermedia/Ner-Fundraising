import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase, uploadAsset } from "@/lib/supabase";
import { useOrg } from "@/lib/org";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, FileImage, Save, FolderOpen, Trash2, Sparkles } from "lucide-react";
import PosterPreview from "@/components/poster/PosterPreview";
import { toast } from "sonner";

export default function CreatePoster() {
  const { org } = useOrg();
  const [posterData, setPosterData] = useState({
    date: "",
    time: "",
    guestSpeaker: "",
    hostName: "",
    address: "",
    coHosts: "",
    bannerText: "",
    showBanner: true,
    customLogoUrl: "",
    backgroundImageUrl: "",
    fontStyle: "serif",
    colorPalette: "default"
  });

  const [selectedStyle, setSelectedStyle] = useState("classic");
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBackground, setUploadingBackground] = useState(false);

  const queryClient = useQueryClient();

  const { data: templates = [] } = useQuery({
    queryKey: ["posterTemplates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("poster_templates").select("*").eq("org_id", org.id).order("created_at", { ascending: false });
      if (error) throw error;
      return data.map((t) => ({ ...t.data, id: t.id, name: t.name, style: t.style, isPreset: t.is_preset }));
    }
  });

  const saveTemplate = useMutation({
    mutationFn: async ({ name, style, isPreset, ...data }) => {
      const { error } = await supabase.from("poster_templates").insert({ org_id: org.id, name, style, is_preset: !!isPreset, data });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posterTemplates"] });
      setSaveDialogOpen(false);
      setTemplateName("");
      toast.success("Template saved successfully!");
    }
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("poster_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posterTemplates"] });
      toast.success("Template deleted!");
    }
  });

  const handleSaveTemplate = () => {
    if (!templateName.trim()) return;
    saveTemplate.mutate({
      name: templateName,
      style: selectedStyle,
      ...posterData,
      isPreset: false
    });
  };

  const handleLoadTemplate = (template) => {
    setPosterData({
      date: template.date || "",
      time: template.time || "",
      guestSpeaker: template.guestSpeaker || "",
      hostName: template.hostName || "",
      address: template.address || "",
      coHosts: template.coHosts || "",
      bannerText: template.bannerText || "",
      showBanner: template.showBanner ?? true,
      customLogoUrl: template.customLogoUrl || "",
      backgroundImageUrl: template.backgroundImageUrl || "",
      fontStyle: template.fontStyle || "serif",
      colorPalette: template.colorPalette || "default"
    });
    setSelectedStyle(template.style);
    setTemplateDialogOpen(false);
    toast.success(`Loaded template: ${template.name}`);
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploadingLogo(true);
    try {
      const file_url = await uploadAsset(org.id, file);
      setPosterData({ ...posterData, customLogoUrl: file_url });
      toast.success("Logo uploaded!");
    } catch (error) {
      toast.error("Failed to upload logo");
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleBackgroundUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploadingBackground(true);
    try {
      const file_url = await uploadAsset(org.id, file);
      setPosterData({ ...posterData, backgroundImageUrl: file_url });
      toast.success("Background uploaded!");
    } catch (error) {
      toast.error("Failed to upload background");
    } finally {
      setUploadingBackground(false);
    }
  };

  const styles = [
    { id: "classic", name: "Classic", desc: "Traditional with decorative accents" },
    { id: "modern", name: "Modern", desc: "Clean and contemporary design" },
    { id: "elegant", name: "Elegant", desc: "Refined with gold accents" },
    { id: "minimalist", name: "Minimalist", desc: "Simple and sophisticated" }
  ];

  const userTemplates = templates.filter(t => !t.isPreset);
  const presetTemplates = templates.filter(t => t.isPreset);

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-amber-50">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur border-b border-emerald-100">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link 
            to="/admin"
            className="inline-flex items-center gap-2 text-emerald-700 hover:text-emerald-900 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-medium">Back</span>
          </Link>
          <h1 className="text-xl font-semibold text-emerald-900">Create Event Poster</h1>
          <div className="flex gap-2">
            {/* Template Library Button */}
            <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="border-emerald-300 text-emerald-700">
                  <FolderOpen className="w-4 h-4 mr-2" />
                  Templates
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-amber-500" />
                    Template Library
                  </DialogTitle>
                  <DialogDescription>
                    Choose from preset templates or your saved designs
                  </DialogDescription>
                </DialogHeader>

                {presetTemplates.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-emerald-900 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-amber-500" />
                      Preset Templates
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      {presetTemplates.map((template) => (
                        <button
                          key={template.id}
                          onClick={() => handleLoadTemplate(template)}
                          className="p-4 border-2 border-gray-200 rounded-lg hover:border-emerald-500 transition-all text-left group"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <h4 className="font-semibold text-sm group-hover:text-emerald-700">
                              {template.name}
                            </h4>
                            <span className="text-xs px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full">
                              {template.style}
                            </span>
                          </div>
                          {template.guestSpeaker && (
                            <p className="text-xs text-gray-600 truncate">Speaker: {template.guestSpeaker}</p>
                          )}
                          {template.bannerText && (
                            <p className="text-xs text-gray-500 truncate italic">"{template.bannerText}"</p>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {userTemplates.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-emerald-900">Your Saved Templates</h3>
                    <div className="grid grid-cols-2 gap-3">
                      {userTemplates.map((template) => (
                        <div
                          key={template.id}
                          className="p-4 border-2 border-gray-200 rounded-lg hover:border-emerald-500 transition-all group"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <button
                              onClick={() => handleLoadTemplate(template)}
                              className="flex-1 text-left"
                            >
                              <h4 className="font-semibold text-sm group-hover:text-emerald-700">
                                {template.name}
                              </h4>
                            </button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-red-500 hover:text-red-700 hover:bg-red-50"
                              onClick={() => deleteTemplate.mutate(template.id)}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                          <button
                            onClick={() => handleLoadTemplate(template)}
                            className="w-full text-left"
                          >
                            <span className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded-full">
                              {template.style}
                            </span>
                            {template.guestSpeaker && (
                              <p className="text-xs text-gray-600 truncate mt-2">Speaker: {template.guestSpeaker}</p>
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {templates.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>No templates saved yet</p>
                  </div>
                )}
              </DialogContent>
            </Dialog>

            {/* Save Template Button */}
            <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="border-amber-300 text-amber-700">
                  <Save className="w-4 h-4 mr-2" />
                  Save
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Save as Template</DialogTitle>
                  <DialogDescription>
                    Save your current poster design to reuse later
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Template Name</Label>
                    <Input
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                      placeholder="e.g., Rosh Chodesh Parlor"
                      className="h-12"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSaveTemplate}
                    disabled={!templateName.trim() || saveTemplate.isPending}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    {saveTemplate.isPending ? "Saving..." : "Save Template"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Left Side - Form */}
          <Card className="border-emerald-100">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileImage className="w-5 h-5" />
                Poster Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Style Selector */}
              <div className="space-y-3">
                <Label className="text-base font-semibold">Poster Style</Label>
                <div className="grid grid-cols-2 gap-3">
                  {styles.map((style) => (
                    <button
                      key={style.id}
                      onClick={() => setSelectedStyle(style.id)}
                      className={`p-4 rounded-lg border-2 text-left transition-all ${
                        selectedStyle === style.id
                          ? "border-emerald-600 bg-emerald-50"
                          : "border-gray-200 bg-white hover:border-emerald-300"
                      }`}
                    >
                      <p className="font-semibold text-sm mb-1">{style.name}</p>
                      <p className="text-xs text-gray-600">{style.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Customization Section */}
              <div className="border-t pt-6 space-y-6">
                <h3 className="font-semibold text-emerald-900">Customization</h3>
                
                {/* Logo Upload */}
                <div className="space-y-2">
                  <Label>Custom Logo</Label>
                  <div className="flex gap-3 items-center">
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      disabled={uploadingLogo}
                      className="h-10"
                    />
                    {posterData.customLogoUrl && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setPosterData({ ...posterData, customLogoUrl: "" })}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                  {uploadingLogo && <p className="text-xs text-emerald-600">Uploading...</p>}
                </div>

                {/* Background Image Upload */}
                <div className="space-y-2">
                  <Label>Background Image</Label>
                  <div className="flex gap-3 items-center">
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={handleBackgroundUpload}
                      disabled={uploadingBackground}
                      className="h-10"
                    />
                    {posterData.backgroundImageUrl && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setPosterData({ ...posterData, backgroundImageUrl: "" })}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                  {uploadingBackground && <p className="text-xs text-emerald-600">Uploading...</p>}
                </div>

                {/* Font Style */}
                <div className="space-y-2">
                  <Label>Font Style</Label>
                  <Select
                    value={posterData.fontStyle}
                    onValueChange={(value) => setPosterData({ ...posterData, fontStyle: value })}
                  >
                    <SelectTrigger className="h-12">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="serif">Serif (Traditional)</SelectItem>
                      <SelectItem value="sans">Sans-Serif (Clean)</SelectItem>
                      <SelectItem value="modern">Modern</SelectItem>
                      <SelectItem value="elegant">Elegant</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Color Palette */}
                <div className="space-y-2">
                  <Label>Color Palette</Label>
                  <Select
                    value={posterData.colorPalette}
                    onValueChange={(value) => setPosterData({ ...posterData, colorPalette: value })}
                  >
                    <SelectTrigger className="h-12">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Default</SelectItem>
                      <SelectItem value="navy-gold">Navy & Gold</SelectItem>
                      <SelectItem value="forest-cream">Forest & Cream</SelectItem>
                      <SelectItem value="burgundy-tan">Burgundy & Tan</SelectItem>
                      <SelectItem value="slate-amber">Slate & Amber</SelectItem>
                      <SelectItem value="teal-coral">Teal & Coral</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Banner Toggle */}
              <div className="flex items-center justify-between p-4 bg-emerald-50 rounded-lg">
                <div>
                  <Label className="text-base">Show Top Banner</Label>
                  <p className="text-sm text-gray-500">Display custom banner text at the top</p>
                </div>
                <Switch
                  checked={posterData.showBanner}
                  onCheckedChange={(checked) => setPosterData({ ...posterData, showBanner: checked })}
                />
              </div>

              {/* Banner Text */}
              {posterData.showBanner && (
                <div className="space-y-2">
                  <Label>Banner Text</Label>
                  <Input
                    value={posterData.bannerText}
                    onChange={(e) => setPosterData({ ...posterData, bannerText: e.target.value })}
                    placeholder="e.g., Special Parlor Meeting"
                    className="h-12"
                  />
                </div>
              )}

              {/* Date */}
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  value={posterData.date}
                  onChange={(e) => setPosterData({ ...posterData, date: e.target.value })}
                  placeholder="e.g., Sunday, January 15th or יום ראשון"
                  className="h-12"
                />
              </div>

              {/* Time */}
              <div className="space-y-2">
                <Label>Time</Label>
                <Input
                  type="time"
                  value={posterData.time}
                  onChange={(e) => setPosterData({ ...posterData, time: e.target.value })}
                  className="h-12"
                />
              </div>

              {/* Guest Speaker */}
              <div className="space-y-2">
                <Label>Guest Speaker</Label>
                <Input
                  value={posterData.guestSpeaker}
                  onChange={(e) => setPosterData({ ...posterData, guestSpeaker: e.target.value })}
                  placeholder="Speaker name"
                  className="h-12"
                />
              </div>

              {/* Host Name */}
              <div className="space-y-2">
                <Label>At the Home of</Label>
                <Input
                  value={posterData.hostName}
                  onChange={(e) => setPosterData({ ...posterData, hostName: e.target.value })}
                  placeholder="Host name"
                  className="h-12"
                />
              </div>

              {/* Address */}
              <div className="space-y-2">
                <Label>Address</Label>
                <Textarea
                  value={posterData.address}
                  onChange={(e) => setPosterData({ ...posterData, address: e.target.value })}
                  placeholder="Full address"
                  className="h-20"
                />
              </div>

              {/* Co-hosts */}
              <div className="space-y-2">
                <Label>Co-hosts (Optional)</Label>
                <Textarea
                  value={posterData.coHosts}
                  onChange={(e) => setPosterData({ ...posterData, coHosts: e.target.value })}
                  placeholder="Enter co-host names (one per line)"
                  className="h-24"
                />
              </div>
            </CardContent>
          </Card>

          {/* Right Side - Live Preview */}
          <div className="lg:sticky lg:top-8 h-fit">
            <Card className="border-emerald-100">
              <CardHeader>
                <CardTitle>Live Preview</CardTitle>
                <p className="text-sm text-gray-500">11x17 inch poster format</p>
              </CardHeader>
              <CardContent>
                <PosterPreview posterData={{ ...posterData, orgName: org.name, orgLogoUrl: org.logo_url }} style={selectedStyle} />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}