import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a date string to a human-readable format
 */
export function formatDate(date: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...options,
  });
}

/**
 * Format time from a datetime string
 */
export function formatTime(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Calculate distance between two GPS coordinates (Haversine formula)
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

/**
 * Check if a coordinate is within the office radius
 */
export function isWithinOfficeRadius(lat: number, lng: number): boolean {
  const officeLat = parseFloat(process.env.NEXT_PUBLIC_OFFICE_LATITUDE || "0");
  const officeLng = parseFloat(process.env.NEXT_PUBLIC_OFFICE_LONGITUDE || "0");
  const radius = parseFloat(process.env.NEXT_PUBLIC_OFFICE_RADIUS_METERS || "200");

  return calculateDistance(lat, lng, officeLat, officeLng) <= radius;
}

/**
 * Get the attendance status color
 */
export function getAttendanceStatusColor(status: string): string {
  const colors: Record<string, string> = {
    Present: "bg-emerald-100 text-emerald-700",
    Absent: "bg-red-100 text-red-700",
    "Half Day": "bg-amber-100 text-amber-700",
    Leave: "bg-blue-100 text-blue-700",
    Holiday: "bg-purple-100 text-purple-700",
    "Week Off": "bg-gray-100 text-gray-500",
  };
  return colors[status] || "bg-gray-100 text-gray-500";
}

/**
 * Get leave request status badge color
 */
export function getLeaveStatusColor(status: string): string {
  const colors: Record<string, string> = {
    Submitted: "bg-amber-100 text-amber-700 border-amber-200",
    Approved: "bg-emerald-100 text-emerald-700 border-emerald-200",
    Rejected: "bg-red-100 text-red-700 border-red-200",
    Cancelled: "bg-gray-100 text-gray-500 border-gray-200",
  };
  return colors[status] || "bg-gray-100 text-gray-500 border-gray-200";
}
