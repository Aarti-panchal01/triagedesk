/** @type {import('next').NextConfig} */
const nextConfig = {
  // The embedding model runs in Node via onnxruntime; keep it out of the bundle.
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node", "sharp"],
  poweredByHeader: false,
};
export default nextConfig;
