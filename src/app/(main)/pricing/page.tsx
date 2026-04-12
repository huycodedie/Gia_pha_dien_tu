"use client";

import { useEffect, useState } from "react";
import { Crown, Check, Clock, Star, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/components/auth-provider";
import { supabase } from "@/lib/supabase";

interface Plan {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  duration_days: number;
  is_free: boolean;
  max_uses: number | null;
  people_limit: number;
}

interface Subscription {
  id: string;
  plan_id: string;
  status: string;
  expires_at: string;
}

export default function PricingPage() {
  const { user, profile, refreshProfile } = useAuth();

  // Guests cannot access pricing page
  if (profile?.role === "guest") {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            Không có quyền truy cập
          </h1>
          <p className="text-gray-600">
            Tài khoản khách không thể truy cập trang nâng cấp.
          </p>
        </div>
      </div>
    );
  }
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState<string | null>(null);

  useEffect(() => {
    fetchPlans();
    if (user) {
      fetchSubscriptions();
    }
  }, [user]);

  const fetchPlans = async () => {
    const { data } = await supabase.from("plans").select("*").order("price");
    if (data) setPlans(data);
  };

  const fetchSubscriptions = async () => {
    const { data } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", user?.id)
      .eq("status", "active");
    if (data) setSubscriptions(data);
  };

  const upgradeRole = async (planId: string) => {
    if (!user) return;

    setUpgrading(planId);
    try {
      const { data, error } = await supabase.rpc("upgrade_user_role", {
        p_user_id: user.id,
        p_plan_id: planId,
      });

      if (error) {
        alert("Lỗi: " + error.message);
      } else if (data === "Success") {
        alert("Nâng cấp thành công!");
        refreshProfile();
        fetchSubscriptions(); // Refresh subscriptions list
      } else {
        alert(data);
      }
    } catch (err) {
      alert("Có lỗi xảy ra");
    }
    setUpgrading(null);
  };

  const getCurrentSubscription = (planId: string) => {
    return subscriptions.find((sub) => sub.plan_id === planId);
  };

  const isPlanAvailable = (plan: Plan) => {
    if (!plan.is_free) {
      // Paid plans: check if user already has an active subscription for this plan
      const sub = getCurrentSubscription(plan.id);
      return !sub; // Available if no active subscription
    }

    // Free plans: check usage limit
    const sub = getCurrentSubscription(plan.id);
    if (sub) return false; // Already used free trial

    return true;
  };

  const getUserRoleDisplay = () => {
    if (!profile) return "Chưa đăng nhập";
    const role = profile.role as string;
    switch (role) {
      case "admin":
        return "Admin";
      case "user":
        return "người dùng (Premium)";
      case "viewer":
        return "người xem (Miễn phí)";
      default:
        return role;
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4 flex items-center justify-center gap-2">
          <Crown className="h-8 w-8 text-yellow-500" />
          Nâng Cấp Tài Khoản
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Mở khóa tất cả tính năng của Gia Phả Điện Tử với các gói nâng cấp phù
          hợp
        </p>
        {user && (
          <div className="mt-4 p-4 bg-muted rounded-lg inline-block">
            <div className="text-sm text-muted-foreground">Cấp độ hiện tại</div>
            <div className="text-lg font-semibold">{getUserRoleDisplay()}</div>
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
        {plans.map((plan) => {
          const currentSub = getCurrentSubscription(plan.id);
          const isAvailable = isPlanAvailable(plan);

          return (
            <Card
              key={plan.id}
              className={`relative ${!isAvailable ? "opacity-60" : ""}`}
            >
              {plan.is_free && (
                <Badge className="absolute -top-2 left-4 bg-green-500">
                  <Star className="h-3 w-3 mr-1" />
                  Free
                </Badge>
              )}

              <CardHeader className="text-center">
                <CardTitle className="text-2xl">{plan.name}</CardTitle>
                <div className="text-3xl font-bold text-primary">
                  {plan.price === 0
                    ? "Miễn phí"
                    : `${plan.price.toLocaleString()} ${plan.currency}`}
                </div>
                <p className="text-sm text-muted-foreground">
                  {plan.description}
                </p>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500" />
                    <span>Nâng cấp từ người xem lên người dùng</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-blue-500" />
                    <span>{plan.duration_days} ngày sử dụng</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-orange-500" />
                    <span>Giới hạn {plan.people_limit} thành viên</span>
                  </div>
                  {plan.is_free && plan.max_uses && (
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-orange-500" />
                      <span>Giới hạn {plan.max_uses} lần sử dụng</span>
                    </div>
                  )}
                </div>

                {currentSub && (
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <div className="text-sm font-medium text-blue-800">
                      Đang active
                    </div>
                    <div className="text-xs text-blue-600">
                      Hết hạn:{" "}
                      {new Date(currentSub.expires_at).toLocaleDateString(
                        "vi-VN",
                      )}
                    </div>
                  </div>
                )}

                <Button
                  className="w-full"
                  onClick={() => upgradeRole(plan.id)}
                  disabled={!isAvailable || upgrading === plan.id || !user}
                  variant={plan.is_free ? "outline" : "default"}
                >
                  {upgrading === plan.id ? (
                    <>Đang xử lý...</>
                  ) : !isAvailable ? (
                    "Đã sử dụng"
                  ) : !user ? (
                    "Đăng nhập để nâng cấp"
                  ) : plan.is_free ? (
                    "Dùng thử miễn phí"
                  ) : (
                    "Nâng cấp ngay"
                  )}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="mt-12 text-center">
        <div className="bg-muted p-6 rounded-lg max-w-2xl mx-auto">
          <h3 className="text-lg font-semibold mb-2">Lưu ý quan trọng</h3>
          <ul className="text-sm text-muted-foreground space-y-1 text-left">
            <li>• Tài khoản sẽ tự động chuyển về người xem khi hết hạn</li>
            <li>• Gói Free Trial chỉ có thể sử dụng 1 lần</li>
            <li>• Gói Premium có thể mua nhiều lần</li>
            <li>• Thanh toán được xử lý an toàn qua hệ thống</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
