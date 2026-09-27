"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { erc20Abi, parseUnits } from "viem";
import { baseSepolia } from "wagmi/chains";
import { useAccount, useConnect, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { USDC_BASE_SEPOLIA, USDC_DECIMALS } from "@choppilot/shared";
import { api } from "@/lib/api";
import { useQuery as useRulesQuery } from "@tanstack/react-query";
import styles from "./WalletCard.module.css";

const EXPLORER = "https://sepolia.basescan.org";

export function WalletCard() {
  const wallet = useQuery({ queryKey: ["wallet"], queryFn: api.wallet, refetchInterval: 15_000 });
  const rules = useRulesQuery({ queryKey: ["rules"], queryFn: api.rules, refetchInterval: 15_000 });
  const { isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const [amount, setAmount] = useState("5");

  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });

  const fund = () => {
    if (!wallet.data) return;
    writeContract({
      abi: erc20Abi,
      address: USDC_BASE_SEPOLIA as `0x${string}`,
      functionName: "transfer",
      args: [wallet.data.address as `0x${string}`, parseUnits(amount || "0", USDC_DECIMALS)],
      chainId: baseSepolia.id,
    });
  };

  if (wallet.isError) {
    // The balance lookup goes agent -> CDP, so a failure here is usually the
    // upstream call, not a dead agent. Say which, or debugging starts in the
    // wrong place.
    const message = (wallet.error as Error).message;
    const upstream = /dns|network|fetch failed|502|timeout/i.test(message);
    return (
      <div className={styles.panel}>
        <div className="label">agent wallet</div>
        <p className={styles.error}>
          {upstream
            ? "Cannot reach Coinbase to read the balance. Check your VPN or network."
            : "Agent unreachable. Start it with pnpm dev:agent."}
        </p>
        <p className={styles.note}>{message}</p>
        <p className={styles.note}>Retrying every 15 seconds.</p>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <div className="label">agent wallet</div>

      <Row label="address" value={wallet.data?.address} link={wallet.data && `${EXPLORER}/address/${wallet.data.address}`} />
      <Row label="pays only" value={wallet.data?.merchant} link={wallet.data && `${EXPLORER}/address/${wallet.data.merchant}`} />
      <Row label="network" value={wallet.data?.network} />
      <Row label="gas" value={wallet.data ? `${wallet.data.eth.toFixed(4)} ETH` : undefined} />

      <hr className="rule" />

      <div className="label" style={{ marginTop: 16 }}>wallet backstop</div>
      <Row label="per payment" value={wallet.data ? `$${wallet.data.spendControls.maxPerPaymentUsdc.toFixed(2)}` : undefined} />
      <Row
        label="cumulative"
        value={wallet.data ? `$${wallet.data.spendControls.maxCumulativeUsdc.toFixed(2)} / ${wallet.data.spendControls.window}` : undefined}
      />
      <p className={styles.note}>
        A second limit inside the wallet itself, set higher than your own
        {rules.data ? ` $${rules.data.weeklyCapUsdc.toFixed(2)} weekly cap` : " weekly cap"} and not
        changeable from this screen. Your rules stop the agent first. This stops it even if the
        agent&apos;s own code is wrong.
      </p>

      <hr className="rule" />

      <div className="label" style={{ marginTop: 16 }}>fund the agent</div>
      {isConnected ? (
        <div className={styles.fundRow}>
          <input
            className={`num ${styles.input}`}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            aria-label="USDC amount"
          />
          <span className={styles.inputUnit}>USDC</span>
          <button className={styles.button} onClick={fund} disabled={isPending || !wallet.data}>
            {isPending ? "confirm in wallet" : "send"}
          </button>
        </div>
      ) : (
        <button
          className={styles.button}
          onClick={() => connectors[0] && connect({ connector: connectors[0] })}
        >
          connect wallet
        </button>
      )}

      {hash ? (
        <p className={styles.note}>
          {receipt.isSuccess ? "funded · " : "pending · "}
          <a href={`${EXPLORER}/tx/${hash}`} target="_blank" rel="noreferrer" className={styles.link}>
            {hash.slice(0, 10)}…
          </a>
        </p>
      ) : null}
      {error ? <p className={styles.error}>{error.message.split("\n")[0]}</p> : null}
    </div>
  );
}

function Row({ label, value, link }: { label: string; value?: string; link?: string | false }) {
  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      <span className={styles.rowRight}>
        {link ? (
          <a href={link} target="_blank" rel="noreferrer" className={`num ${styles.rowValue} ${styles.link}`}>
            {truncate(value)}
          </a>
        ) : (
          <span className={`num ${styles.rowValue}`}>{truncate(value)}</span>
        )}
        {value && value.startsWith("0x") ? <CopyButton value={value} /> : null}
      </span>
    </div>
  );
}

// Addresses are the one thing on this screen people need to paste elsewhere,
// into a faucet, a wallet, or an explorer.
function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard
      .writeText(value)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      })
      .catch(() => setCopied(false));
  };

  return (
    <button
      type="button"
      className={styles.copy}
      onClick={copy}
      aria-label={copied ? "copied" : `copy ${value}`}
      title={copied ? "copied" : "copy address"}
    >
      {copied ? (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M3 8.5l3.2 3.2L13 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="5.4" y="5.4" width="8.1" height="8.1" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
          <path d="M10.6 5.4V4a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 4v5.1A1.5 1.5 0 0 0 4 10.6h1.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}

function truncate(value?: string): string {
  if (!value) return "—";
  return value.startsWith("0x") && value.length > 20
    ? `${value.slice(0, 6)}…${value.slice(-4)}`
    : value;
}
