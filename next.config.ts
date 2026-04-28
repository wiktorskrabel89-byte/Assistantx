import type { NextConfig } from "next";


const nextConfig: NextConfig = {
	async headers() {
		return [
			{
				// Applies to all paths
				source: '/(.*)',
				headers: [
					{
						key: 'Cache-Control',
						// Forces revalidation - key for avoiding ChunkLoadError
						value: 'public, s-maxage=0, must-revalidate',
					},
				],
			},
			{
				// Static files can be cached long-term (they have unique hashes)
				source: '/_next/static/(.*)',
				headers: [
					{
						key: 'Cache-Control',
						value: 'public, max-age=31536000, immutable',
					},
				],
			},
		];
	},
};

export default nextConfig;
