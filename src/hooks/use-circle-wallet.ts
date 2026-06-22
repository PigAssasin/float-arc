"use client";

import { useState, useCallback, useRef } from "react";

// Type-only import — does NOT cause the SDK to initialise at module load time
import type { W3SSdk as W3SSdkType } from "@circle-fin/w3s-pw-web-sdk";

export type CircleWalletState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "pin-setup" }
  | { status: "connected"; address: `0x${string}`; walletId: string; userToken: string }
  | { status: "error"; message: string };

export interface CircleContractCall {
  contractAddress: `0x${string}`;
  abiFunctionSignature: string;       // e.g. "deposit(uint256)"
  abiParameters: (string | number | boolean)[];
  amount?: string;                    // native token to send (rarely needed here)
}

const APP_ID = process.env.NEXT_PUBLIC_CIRCLE_APP_ID!;
const EMAIL_KEY = "circle_email";

type CircleWalletEntry = { id: string; address: string; state: string; blockchain?: string };

const ARC_CHAIN = "ARC-TESTNET";

// Remember the last email used on this device so returning users don't retype it.
export function getSavedEmail(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(EMAIL_KEY) ?? "";
}

export function useCircleWallet() {
  const [state, setState] = useState<CircleWalletState>({ status: "idle" });
  // The SDK instance is kept across the session so contract-execution challenges
  // can reuse the same authenticated SDK after the initial connect.
  const sdkRef = useRef<W3SSdkType | null>(null);

  const ensureSdk = useCallback(async (userToken: string, encryptionKey: string) => {
    if (!sdkRef.current) {
      const { W3SSdk } = await import("@circle-fin/w3s-pw-web-sdk");
      sdkRef.current = new W3SSdk({ appSettings: { appId: APP_ID } });
    }
    sdkRef.current.setAuthentication({ userToken, encryptionKey });
    return sdkRef.current;
  }, []);

  const runChallenge = useCallback((sdk: W3SSdkType, challengeId: string) => {
    return new Promise<void>((resolve, reject) => {
      sdk.execute(challengeId, (err) => {
        if (err) return reject(new Error(err.message || "Challenge failed"));
        resolve();
      });
    });
  }, []);

  const connect = useCallback(async (email: string) => {
    setState({ status: "loading" });

    try {
      const normalizedEmail = email.trim().toLowerCase();
      if (!normalizedEmail) throw new Error("Email is required");
      localStorage.setItem(EMAIL_KEY, normalizedEmail);

      // Step 1: Get userToken + encryptionKey from our backend. The backend
      // derives a stable userId from the email, so the same email recovers the
      // same wallet on any device.
      const initRes = await fetch("/api/circle/init-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail }),
      });
      const { userToken, encryptionKey, error } = await initRes.json();
      if (error) throw new Error(error);

      // Authenticate the SDK now so it is ready for later signing challenges.
      const sdk = await ensureSdk(userToken, encryptionKey);

      // Step 2: Check if the user already has a wallet ON ARC-TESTNET. A wallet on
      // any other chain (e.g. a legacy EVM-TESTNET one) cannot execute Arc contracts.
      const walletsRes = await fetch("/api/circle/wallets", {
        headers: { "X-User-Token": userToken },
      });
      const walletsData = await walletsRes.json();
      const allWallets: CircleWalletEntry[] = walletsData?.wallets ?? [];
      const existingWallet = allWallets.find(
        (w) => w.state === "LIVE" && w.blockchain === ARC_CHAIN
      );

      if (existingWallet) {
        setState({
          status: "connected",
          address: existingWallet.address as `0x${string}`,
          walletId: existingWallet.id,
          userToken,
        });
        return;
      }

      setState({ status: "pin-setup" });

      // Step 3: Create an Arc wallet. If the user already has a PIN (a wallet on
      // another chain exists), Circle needs /user/wallets; otherwise /user/initialize.
      const createRes = await fetch("/api/circle/create-wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userToken, hasPin: allWallets.length > 0 }),
      });
      const createData = await createRes.json();
      if (createData.error) throw new Error(createData.error);

      const challengeId = createData?.challengeId;
      if (!challengeId) throw new Error("No challengeId returned");

      // Step 4: Execute PIN challenge (sets PIN + provisions the wallet)
      await runChallenge(sdk, challengeId);

      // Step 5: Fetch the wallet after PIN setup. Provisioning is async on
      // Circle's side, so the wallet may not be LIVE immediately — poll a few times.
      let wallet: CircleWalletEntry | undefined;
      for (let attempt = 0; attempt < 12 && !wallet; attempt++) {
        const newWalletsRes = await fetch("/api/circle/wallets", {
          headers: { "X-User-Token": userToken },
        });
        const newWalletsData = await newWalletsRes.json();
        wallet = newWalletsData?.wallets?.find(
          (w: CircleWalletEntry) => w.state === "LIVE" && w.blockchain === ARC_CHAIN
        );
        if (!wallet) await new Promise((r) => setTimeout(r, 1500));
      }

      if (!wallet) throw new Error("Wallet is still provisioning. Please click Connect again in a moment.");

      setState({
        status: "connected",
        address: wallet.address as `0x${string}`,
        walletId: wallet.id,
        userToken,
      });
    } catch (err) {
      setState({ status: "error", message: (err as Error).message });
    }
  }, [ensureSdk, runChallenge]);

  // Execute a contract write through the Circle wallet: ask the backend for a
  // contract-execution challenge, then run the PIN challenge in the Circle UI.
  // Resolves once the user approves; Circle then broadcasts the tx to Arc.
  const executeContract = useCallback(
    async (call: CircleContractCall): Promise<void> => {
      if (state.status !== "connected") throw new Error("Circle wallet is not connected");
      const sdk = sdkRef.current;
      if (!sdk) throw new Error("Circle session expired. Please reconnect your wallet.");

      const res = await fetch("/api/circle/execute-contract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userToken: state.userToken,
          walletId: state.walletId,
          contractAddress: call.contractAddress,
          abiFunctionSignature: call.abiFunctionSignature,
          abiParameters: call.abiParameters,
          amount: call.amount,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (!data.challengeId) throw new Error("No challengeId returned");

      await runChallenge(sdk, data.challengeId);
    },
    [state, runChallenge]
  );

  const disconnect = useCallback(() => {
    // Keep the saved email so the user can reconnect to the same wallet easily.
    setState({ status: "idle" });
  }, []);

  return { state, connect, disconnect, executeContract };
}
