import type { NextConfig } from 'next';
import { readTeamWallet, readToken } from './lib/token';

// The site is published only with its contract and, on production, its team wallet. A missing or
// invalid TOKEN_CA, TOKEN_TICKER or TEAM_WALLET stops the build here with a readable error.
readToken();
readTeamWallet();

const nextConfig: NextConfig = {
  // The OG image reads its fonts from disk at runtime.
  outputFileTracingIncludes: { '/opengraph-image': ['./assets/**/*'] },
};

export default nextConfig;
