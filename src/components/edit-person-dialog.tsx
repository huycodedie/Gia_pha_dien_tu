"use client";

import { useState, useRef } from "react";
import { X, Upload, Loader2, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  uploadPersonImage,
  deletePersonImage,
  updatePersonProfile,
} from "@/lib/supabase-data";
import type { PersonDetail } from "@/lib/genealogy-types";

interface EditPersonDialogProps {
  person: PersonDetail;
  onClose: () => void;
  onSuccess: () => void;
}

export function EditPersonDialog({
  person,
  onClose,
  onSuccess,
}: EditPersonDialogProps) {
  const [displayName, setDisplayName] = useState(person.displayName || "");
  const [isLiving, setIsLiving] = useState(person.isLiving);
  const [phone, setPhone] = useState(person.phone || "");
  const [facebook, setFacebook] = useState(person.facebook || "");
  const [currentAddress, setCurrentAddress] = useState(
    person.currentAddress || "",
  );
  const [imageUrl, setImageUrl] = useState(person.imageUrl || "");
  const [imagePreview, setImagePreview] = useState(person.imageUrl || "");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      setError("Vui lòng chọn file ảnh");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError("Kích thước ảnh không được vượt quá 5MB");
      return;
    }

    setUploading(true);
    setError("");

    // Upload to Supabase
    const { url, error: uploadError } = await uploadPersonImage(
      file,
      person.handle,
    );

    if (uploadError) {
      setError(`Lỗi upload: ${uploadError}`);
      setUploading(false);
      return;
    }

    // Delete old image if exists
    if (person.imageUrl) {
      await deletePersonImage(person.imageUrl);
    }

    setImageUrl(url || "");
    setImagePreview(url || "");
    setUploading(false);

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleRemoveImage = async () => {
    if (imageUrl) {
      await deletePersonImage(imageUrl);
    }
    setImageUrl("");
    setImagePreview("");
  };

  const handleSubmit = async () => {
    if (!displayName.trim()) {
      setError("Vui lòng nhập họ tên");
      return;
    }

    setSaving(true);
    setError("");

    const result = await updatePersonProfile(person.handle, {
      displayName: displayName.trim(),
      isLiving,
      phone: phone.trim() || null,
      facebook: facebook.trim() || null,
      currentAddress: currentAddress.trim() || null,
      imageUrl: imageUrl || null,
    });

    setSaving(false);

    if (result.error) {
      setError(result.error);
    } else {
      toast.success("Sửa thông tin thành công!");
      onSuccess();
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-[500px] max-w-[95vw] max-h-[90vh] overflow-y-auto animate-in zoom-in-95 fade-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white dark:bg-slate-900">
          <h3 className="font-semibold text-base">Chỉnh sửa thông tin</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Image Upload Section */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Ảnh đại diện
            </label>
            <div className="flex gap-3">
              <div className="flex-1">
                {imagePreview ? (
                  <div className="relative">
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="w-full h-32 object-cover rounded-lg border border-border"
                    />
                    <button
                      onClick={handleRemoveImage}
                      className="absolute top-1 right-1 p-1 bg-red-500 hover:bg-red-600 rounded-full text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="w-full h-32 rounded-lg border-2 border-dashed border-muted-foreground/25 flex flex-col items-center justify-center bg-muted/20">
                    <ImageIcon className="w-8 h-8 text-muted-foreground/50 mb-1" />
                    <p className="text-xs text-muted-foreground text-center px-2">
                      Chưa có ảnh
                    </p>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageSelect}
                  className="hidden"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="whitespace-nowrap"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      Đang upload...
                    </>
                  ) : (
                    <>
                      <Upload className="w-3 h-3 mr-1" />
                      Chọn ảnh
                    </>
                  )}
                </Button>
                {imageUrl && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleRemoveImage}
                    className="text-red-600 hover:text-red-700"
                  >
                    Xóa
                  </Button>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Tối đa 5MB. Định dạng: JPG, PNG, GIF
            </p>
          </div>

          {/* Basic Info */}
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 block">
              Họ tên *
            </label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="VD: Nguyễn Văn A"
              className="text-sm"
            />
          </div>

          {/* Living Status */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isLiving"
              checked={isLiving}
              onChange={(e) => setIsLiving(e.target.checked)}
              className="rounded"
            />
            <label
              htmlFor="isLiving"
              className="text-xs text-slate-600 dark:text-slate-400"
            >
              Còn sống
            </label>
          </div>

          {/* Contact Info */}
          <div className="space-y-3 pt-2 border-t">
            <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Thông tin liên lạc
            </h4>

            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 block">
                Số điện thoại
              </label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0901234567"
                className="text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 block">
                Facebook
              </label>
              <Input
                value={facebook}
                onChange={(e) => setFacebook(e.target.value)}
                placeholder="https://facebook.com/username"
                className="text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 block">
                Địa chỉ hiện tại
              </label>
              <Input
                value={currentAddress}
                onChange={(e) => setCurrentAddress(e.target.value)}
                placeholder="Hà Nội, Việt Nam"
                className="text-sm"
              />
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/30 p-3 text-xs text-red-700 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2 border-t">
            <Button
              variant="outline"
              className="flex-1"
              onClick={onClose}
              disabled={saving || uploading}
            >
              Hủy
            </Button>
            <Button
              className="flex-1"
              onClick={handleSubmit}
              disabled={saving || uploading}
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Đang lưu...
                </>
              ) : (
                "Lưu thay đổi"
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
