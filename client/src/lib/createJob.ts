export type ServiceType = "junk" | "moving" | "labor";

export interface CreateJobPayload {
  serviceType: ServiceType;
  address: string;
  customerName: string;
  phone: string;
  email: string;
  [key: string]: unknown;
}

export interface CreateJobResponse {
  jobId: string;
  status: string;
  crewCount: number;
  message: string;
  totalPrice?: number;
}

export async function createJob(payload: CreateJobPayload): Promise<CreateJobResponse> {
  const { serviceType, ...rest } = payload;
  const res = await fetch(`/api/jobs/create-${serviceType}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(rest),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.error || "Failed to create job");
  }
  return res.json();
}
