/**
 * Whether goods are bought from other companies than Ayra too. The distributor buys only from Ayra, so the vendor screens
 * are hidden. Nothing is deleted: set NEXT_PUBLIC_OTHER_VENDORS=true and build again to show them.
 */
export const OTHER_VENDORS: boolean = process.env.NEXT_PUBLIC_OTHER_VENDORS === "true";
