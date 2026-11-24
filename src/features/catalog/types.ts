export interface UnitOption {
  unitId: string;
  nameEn: string;
  nameUr: string;
  factor: number;
  salePrice: string | null;
  /** Null when not set or when the user may not see costs. */
  purchasePrice: string | null;
}

/** A product as offered by the product picker. */
export interface ProductOption {
  id: string;
  sku: string;
  nameEn: string;
  nameUr: string | null;
  baseUnitId: string;
  units: UnitOption[];
  /** Available (on hand less reserved) in base units per warehouse; null when the user may not see stock. */
  available: Record<string, number> | null;
}

export interface Choice {
  id: string;
  nameEn: string;
  nameUr: string | null;
}
