// Single source of truth. Empty string = not stated yet; the UI keeps that slot inert.
export const CFG = {
  ca: "", // token contract address — set once stated (0x + 40 hex)
  x: "", // e.g. https://x.com/essenceOnl — inert until set
  github: "", // inert until set
  chainId: 4663,
  chainName: "Robinhood Chain",
  rpc: "https://rpc.mainnet.chain.robinhood.com",
  explorer: "https://robinhoodchain.blockscout.com",
  llamaChain: "Robinhood Chain",
  dexChain: "robinhood",
  chainPoll: 8000,
  slowPoll: 60000,
};
