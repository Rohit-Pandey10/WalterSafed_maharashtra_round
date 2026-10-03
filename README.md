# Heirloom (WalterSafed) — Trust-Minimized Digital Inheritance Protocol

> **BitNBuild Hackathon — Maharashtra Round**  
> *A decentralized, threshold-based Dead Man's Switch and digital asset recovery protocol.*

---

[![React](https://img.shields.io/badge/React-19.0-blue?logo=react)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8.0-646CFF?logo=vite)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4.0-38BDF8?logo=tailwindcss)](https://tailwindcss.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![IPFS](https://img.shields.io/badge/Storage-IPFS-65C2CB?logo=ipfs)](https://ipfs.tech/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## 📌 Problem Overview

People increasingly hold critical assets digitally — encrypted recovery phrases, private credentials, legal documents, cryptocurrency wallets, and confidential archives. 

- **The Inheritence Dilemma:** When an owner becomes permanently unavailable or incapacitated, heirs and beneficiaries often have no reliable way to access these critical assets.
- **The Inactivity Risk:** Traditional dead man's switches relying solely on a simple timer risk premature disclosure if the owner is temporarily offline, hospitalized, or traveling.
- **The Centralization Risk:** Entrusting secrets to a single custodian, cloud platform, or administrator creates single points of failure and unauthorized access risks.

**Heirloom (WalterSafed)** solves this by providing a **trust-minimized, multi-guardian dead man's switch protocol** that guarantees secure asset succession without relying on a single trusted third party.

---

## ⚡ Key Features

- 💓 **Owner Heartbeat Signal:** Regular check-ins reset the vault countdown timer, continuously confirming the owner's active status.
- ⏳ **Fail-Safe Grace Period:** When a heartbeat interval expires without a check-in, the vault automatically enters a protective grace period rather than releasing data immediately.
- 👥 **Multi-Guardian Quorum Verification:** Designated guardians must independently review and sign off before any vault payload can be unlocked.
- 🚨 **Emergency Owner Intervention:** The owner retains full authority to cancel an active recovery process or revoke vault configurations at any point during the grace period.
- 📦 **IPFS CID & Encrypted Payload Integration:** Vault payload metadata and encrypted secrets are linked directly via decentralized IPFS Content Identifiers.
- 🎭 **Multi-Role Viewfinder:** Seamlessly switch views between **Owner**, **Guardian**, and **Beneficiary** to audit state and fulfill verification duties.
- 🎨 **OFF+BRAND Architectural Aesthetic:** Designed following the *OFF+BRAND* editorial specification — utilizing warm parchment canvases (`#e5e4e0`), crisp monochromatic typography, and signature iridescent status elements.

---

## 🔄 Vault Lifecycle & State Machine

```
                  +-----------------------------------+
                  |              ACTIVE               |
                  |     (Heartbeat operational)       |
                  +-----------------+-----------------+
                                    |
                    Heartbeat interval expires
                                    |
                                    v
                  +-----------------------------------+
                  |          IN GRACE PERIOD          | <--- Owner can CANCEL at any time
                  |   (Guardians review & approve)    |
                  +-----------------+-----------------+
                                    |
                    Quorum threshold reached (e.g. 2/3)
                                    |
                                    v
                  +-----------------------------------+
                  |             APPROVED              |
                  |  (Payload unlocked for release)   |
                  +-----------------+-----------------+
                                    |
                    Beneficiary claims payload
                                    |
                                    v
                  +-----------------------------------+
                  |              CLAIMED              |
                  |      (Asset transfer complete)    |
                  +-----------------------------------+
```

---

## 📁 Repository Structure

```
WalterSafed_maharashtra_round/
├── src/
│   ├── components/
│   │   ├── CreateVaultModal.tsx      # Modal to construct & configure new inheritance vaults
│   │   ├── EmptyState.tsx            # Fallback graphic for filtered vault views
│   │   ├── MetricsRow.tsx            # Live statistical summaries (Active, Grace, Approved)
│   │   ├── Navbar.tsx                # OFF+BRAND navigation, role filters & wallet state
│   │   ├── SecretPayloadViewer.tsx   # Decryption & view modal for approved secret payloads
│   │   ├── Toast.tsx                 # Real-time transaction feedback toast system
│   │   └── VaultCard.tsx             # Interactive vault status card & execution interface
│   ├── App.tsx                       # Main application state, filter router & protocol logic
│   ├── index.css                     # Global Tailwind CSS v4 configuration & theme variables
│   ├── main.tsx                      # React root entry point
│   ├── types.ts                      # TypeScript interfaces (Vault, Guardian, UserRole, Status)
│   └── vite-env.d.ts                 # Vite environment definitions
├── DESIGN.md                         # OFF+BRAND typography and styling specification
├── index.html                        # Application HTML shell
├── package.json                      # Dependencies & scripts
├── tsconfig.json                     # TypeScript compiler configuration
└── vite.config.ts                    # Vite build configuration with Tailwind v4 plugin
```

---

## 🚀 Getting Started

### Prerequisites

Ensure you have the following installed on your environment:
- **Node.js**: v18.0.0 or higher
- **pnpm** (recommended) or **npm** / **yarn**

### Installation

1. **Clone the Repository**
   ```bash
   git clone https://github.com/Rosander0/WalterSafed_maharashtra_round.git
   cd WalterSafed_maharashtra_round
   ```

2. **Install Dependencies**
   ```bash
   pnpm install
   # or
   npm install
   ```

3. **Start the Development Server**
   ```bash
   pnpm dev
   # or
   npm run dev
   ```
   Open your browser and navigate to `http://localhost:5173` (or the port specified in terminal output).

4. **Build for Production**
   ```bash
   pnpm build
   # or
   npm run build
   ```

---

## 🎨 Design System

This application adheres to the **OFF+BRAND** design specification defined in [`DESIGN.md`](./DESIGN.md):
- **Canvas:** Warm Parchment (`#e5e4e0`)
- **Typography:** Ataero Retina OB Edition / Geometric Editorial Sans
- **Elevated Surfaces:** Pure Paper White (`#ffffff`)
- **Accents:** Signature Iridescent Gradient Sphere (`linear-gradient(255deg, #facb00, #f06ba8 30%, #78bae6 65%, #ffffff)`)
- **Interactive Elements:** Crisp 10px rounded borders with ghost interaction fills and zero elevation box-shadows.

---

## 🏆 Hackathon Submission Details

- **Event:** BitNBuild — Maharashtra Round
- **Problem Statement:** Problem 2 — *Heirloom: Trust-Minimized Digital Inheritance*
- **Team / Author:** Rosander0
- **Repository:** [https://github.com/Rosander0/WalterSafed_maharashtra_round.git](https://github.com/Rosander0/WalterSafed_maharashtra_round.git)

---

## 📜 License

This project is open-source and licensed under the [MIT License](LICENSE).
