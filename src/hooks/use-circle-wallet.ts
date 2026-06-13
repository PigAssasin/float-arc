"use client";

import { useState, useCallback } from "react";
import { W3SSdk } from "@circle-fin/w3s-pw-web-sdk";

export type CircleWalletState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "pin-setup"; sdk: W3SSdk }
  | { status: "connected"; address: `0x${string}`; userToken: string }
  | { status: "error"; message: string };

const APP_ID = process.env.NEXT_PUBLIC_CIRCLE_APP_ID!;

// Stable userId per browser session (not persisted to server)
function getOrCreateUserId(): string {
  const key = "circle_user_id";
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
  }
  return id;
}

export function useCircleWallet() {
  const [state, setState] = useState<CircleWalletState>({ status: "idle" });

  const connect = useCallback(async () => {
    setState({ status: "loading" });

    try {
      const userId = getOrCreateUserId();

      // Step 1: Get userToken + encryptionKey from our backend
      const initRes = await fetch("/api/circle/init-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const { userToken, encryptionKey, error } = await initRes.json();
      if (error) throw new Error(error);

      // Step 2: Check if user already has a wallet
      const walletsRes = await fetch("/api/circle/wallets", {
        headers: { "X-User-Token": userToken },
      });
      const walletsData = await walletsRes.json();
      const existingWallet = walletsData?.wallets?.find(
        (w: { address: string; state: string }) => w.state === "LIVE"
      );

      if (existingWallet) {
        setState({
          status: "connected",
          address: existingWallet.address as `0x${string}`,
          userToken,
        });
        return;
      }

      // Step 3: Initialize Circle SDK and prompt PIN setup
      const sdk = new W3SSdk({ appSettings: { appId: APP_ID } });
      sdk.setAuthentication({ userToken, encryptionKey });

      setState({ status: "pin-setup", sdk });

      // Step 4: Create wallet (triggers PIN challenge in Circle UI)
      const createRes = await fetch("/api/circle/create-wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userToken }),
      });
      const createData = await createRes.json();
      if (createData.error) throw new Error(createData.error);

      const challengeId = createData?.challengeId;
      if (!challengeId) throw new Error("No challengeId returned");

      // Step 5: Execute PIN challenge
      await new Promise<void>((resolve, reject) => {
        sdk.execute(challengeId, (err, result) => {
          if (err) return reject(new Error(err.message));
          if (result?.type === "SET_PIN") resolve();
          else resolve();
        });
      });

      // Step 6: Fetch wallet address after PIN setup
      const newWalletsRes = await fetch("/api/circle/wallets", {
        headers: { "X-User-Token": userToken },
      });
      const newWalletsData = await newWalletsRes.json();
      const wallet = newWalletsData?.wallets?.find(
        (w: { address: string; state: string }) => w.state === "LIVE"
      );

      if (!wallet) throw new Error("Wallet not found after PIN setup");

      setState({
        status: "connected",
        address: wallet.address as `0x${string}`,
        userToken,
      });
    } catch (err) {
      setState({ status: "error", message: (err as Error).message });
    }
  }, []);

  const disconnect = useCallback(() => {
    sessionStorage.removeItem("circle_user_id");
    setState({ status: "idle" });
  }, []);

  return { state, connect, disconnect };
}
