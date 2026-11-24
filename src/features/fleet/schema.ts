import { z } from "zod";
import { optionalDate, optionalId, requiredId, requiredText, text } from "@/lib/validation/common";

export const FUEL_TYPES = ["petrol", "diesel", "cng", "electric", "hybrid", "other"] as const;
export const OWNERSHIPS = ["owned", "rented"] as const;
export const VEHICLE_STATUSES = ["active", "maintenance", "out_of_service", "retired"] as const;

export const vehicleSchema = z.object({
  registration: requiredText(30), name: requiredText(80), type: text(60), make: text(60), model: text(60), capacity: text(60), driverId: optionalId,
  fuelType: z.union([z.literal(""), z.enum(FUEL_TYPES)]), ownership: z.enum(OWNERSHIPS), status: z.enum(VEHICLE_STATUSES), notes: text(500),
});
export type VehicleValues = z.infer<typeof vehicleSchema>;

export const driverSchema = z.object({ employeeId: requiredId, license: text(60), licenseExpiry: optionalDate, isActive: z.boolean() });
export type DriverValues = z.infer<typeof driverSchema>;
