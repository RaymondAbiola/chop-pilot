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
  const rules = useRulesQuery({ queryKey: ["rules"], queryFn: api.rules });
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
    return (
      <div className={styles.panel}>
        <div className="label">agent wallet</div>
        <p className={styles.error}>Agent unreachable. Start it with pnpm dev:agent.</p>
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
      {link ? (
        <a href={link} target="_blank" rel="noreferrer" className={`num ${styles.rowValue} ${styles.link}`}>
          {truncate(value)}
        </a>
      ) : (
        <span className={`num ${styles.rowValue}`}>{truncate(value)}</span>
      )}
    </div>
  );
}

function truncate(value?: string): string {
  if (!value) return "—";
  return value.startsWith("0x") && value.length > 20
    ? `${value.slice(0, 6)}…${value.slice(-4)}`
    : value;
}
