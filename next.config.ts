/** @type {import('next').NextConfig} */
const nextConfig = {
	generateEtags: false,
	headers: async () => [
		{
			source: '/_next/static/:path*',
			headers: [
				{
					key: 'Cache-Control',
					value: 'public, max-age=31536000, immutable',
				},
			],
		},
	],
};

export default nextConfig;
