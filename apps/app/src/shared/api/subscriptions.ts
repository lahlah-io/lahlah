import { apiRequest } from "@/shared/api/client";
import type { DataEnvelope } from "@/shared/api/types";

/** Ringkasan plan aktif dari `GET /api/v1/subscriptions/me`. */
export interface MyPlanSummary {
  limits: {
    allowedModelIds: string[] | null;
    chatMessagesPerMonth: number | null;
    maxChatSessions: number | null;
    maxItineraries: number | null;
  };
  plan: {
    billingInterval: string;
    description: string | null;
    id: string;
    name: string;
    price: string;
  };
  subscription: {
    expiresAt: string | null;
    status: string;
  };
  usage: {
    chatMessages: number;
    chatSessions: number;
    itineraries: number;
  };
}

export async function fetchMyPlan(): Promise<MyPlanSummary> {
  const response = await apiRequest<DataEnvelope<MyPlanSummary>>(
    "/api/v1/subscriptions/me",
  );
  return response.data;
}
