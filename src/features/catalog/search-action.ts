"use server";

import { z } from "zod";
import { authorize } from "@/lib/auth/session";
import { findProductOptions } from "./product-options";
import type { ProductOption } from "./types";

export async function searchProductsAction(query: unknown): Promise<ProductOption[]> {
  const ctx = await authorize("products.view");
  const parsed = z.string().max(80).safeParse(query);
  return parsed.success ? findProductOptions(ctx, parsed.data) : [];
}
