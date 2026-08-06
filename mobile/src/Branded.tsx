import { useState, type ReactNode } from "react";
import { BrandProvider, type BrandSource } from "./brand";
import { useAuth } from "./auth";

/**
 * Feeds the school's branding into the tree.
 *
 * After sign-in it comes from the session. Before sign-in there is no session,
 * so the parent login screen publishes what the school-code lookup returned —
 * which is the point of FRD §8.2 asking for branding on the login screen: it is
 * the last moment a parent can notice they typed another school's code.
 */
let publish: (school: BrandSource) => void = () => {};

/** Called by the login screen once a school code resolves. */
export const previewBrand = (school: BrandSource) => publish(school);

export default function Branded({ children }: { children: ReactNode }) {
  const { school } = useAuth();
  const [preview, setPreview] = useState<BrandSource>(null);
  publish = setPreview;

  // The signed-in school always wins; the preview only fills the gap before it.
  return <BrandProvider school={school ?? preview}>{children}</BrandProvider>;
}
