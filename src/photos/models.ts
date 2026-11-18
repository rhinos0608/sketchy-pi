export type ModelTier = "small" | "medium" | "large";

export type ModelInfo = {
  tier: ModelTier;
  repo: string;
  dtype: "8bit" | "bf16";
  title: string;
  downloadMb: number;
  ramGb: number;
  speed: string;
  quality: string;
};

/** Local MLX checkpoints. Actual inference time varies by Apple Silicon device. */
export const MODELS: Record<ModelTier, ModelInfo> = {
  small: {
    tier: "small", repo: "mlx-community/Florence-2-base-ft-8bit", dtype: "8bit",
    title: "Small", downloadMb: 270, ramGb: 1,
    speed: "Hardware-dependent", quality: "Compact model for printed text and distinct parts",
  },
  medium: {
    tier: "medium", repo: "mlx-community/Florence-2-large-ft-8bit", dtype: "8bit",
    title: "Medium", downloadMb: 901, ramGb: 2.5,
    speed: "Hardware-dependent", quality: "Larger model with 8-bit MLX quantization",
  },
  large: {
    tier: "large", repo: "mlx-community/Florence-2-large-ft-bf16", dtype: "bf16",
    title: "Large", downloadMb: 1900, ramGb: 4.5,
    speed: "Hardware-dependent", quality: "Large model at higher precision",
  },
};

export function unavailableReason(
  _tier: ModelTier,
  _versions: NodeJS.ProcessVersions = process.versions,
): string | undefined {
  if (process.platform !== "darwin" || process.arch !== "arm64")
    return "MLX photo labeling requires an Apple Silicon Mac.";
  return undefined;
}

export function isModelTier(value: unknown): value is ModelTier {
  return typeof value === "string" && value in MODELS;
}
