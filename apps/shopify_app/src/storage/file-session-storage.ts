import { promises as fs } from "fs";
import path from "path";

import type { SessionInterface, SessionStorage } from "@shopify/shopify-api";
import { Session } from "@shopify/shopify-api";

type StoredSession = SessionInterface & {
  expires?: string | null;
};

const OFFLINE_PREFIX = "offline_";

export class FileSessionStorage implements SessionStorage {
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async storeSession(session: SessionInterface): Promise<boolean> {
    const store = await this.readStore();
    store[session.id] = this.serialiseSession(session);
    await this.writeStore(store);
    return true;
  }

  async loadSession(id: string): Promise<Session | undefined> {
    const store = await this.readStore();
    const raw = store[id];
    if (!raw) {
      return undefined;
    }
    return this.hydrateSession(raw);
  }

  async deleteSession(id: string): Promise<boolean> {
    const store = await this.readStore();
    if (!store[id]) {
      return false;
    }
    delete store[id];
    await this.writeStore(store);
    return true;
  }

  async deleteSessions(ids: string[]): Promise<number> {
    const store = await this.readStore();
    let deleted = 0;
    for (const id of ids) {
      if (store[id]) {
        delete store[id];
        deleted += 1;
      }
    }
    if (deleted > 0) {
      await this.writeStore(store);
    }
    return deleted;
  }

  async findSessionsByShop(shop: string): Promise<Session[]> {
    const store = await this.readStore();
    const sessions: Session[] = [];
    for (const raw of Object.values(store)) {
      if (raw.shop === shop) {
        sessions.push(this.hydrateSession(raw));
      }
    }
    return sessions;
  }

  async findSessionsByShopAndUser(_shop: string, _userId: string): Promise<Session[]> {
    // Optional interface method for granular lookups; not needed for this app.
    return [];
  }

  async hasSession(id: string): Promise<boolean> {
    const store = await this.readStore();
    return Boolean(store[id]);
  }

  async deleteSessionsByShop(shop: string): Promise<number> {
    const store = await this.readStore();
    const idsToDelete = Object.entries(store)
      .filter(([, value]) => value.shop === shop)
      .map(([id]) => id);
    return this.deleteSessions(idsToDelete);
  }

  async storeOfflineSession(session: SessionInterface): Promise<boolean> {
    return this.storeSession(session);
  }

  async storeOnlineSession(session: SessionInterface): Promise<boolean> {
    return this.storeSession(session);
  }

  async loadOfflineSession(shop: string): Promise<Session | undefined> {
    return this.loadSession(this.offlineSessionId(shop));
  }

  async loadOnlineSession(id: string): Promise<Session | undefined> {
    return this.loadSession(id);
  }

  private serialiseSession(session: SessionInterface): StoredSession {
    const plain = "toObject" in session ? (session as Session).toObject() : session;
    return {
      ...plain,
      expires: plain.expires ? new Date(plain.expires).toISOString() : null,
    };
  }

  private hydrateSession(raw: StoredSession): Session {
    const session = new Session(raw.id, raw.shop, raw.isOnline);
    session.state = raw.state;
    session.scope = raw.scope;
    session.accessToken = raw.accessToken;
    session.expires = raw.expires ? new Date(raw.expires) : undefined;
    session.onlineAccessInfo = raw.onlineAccessInfo;
    session.user = raw.user;
    return session;
  }

  private async readStore(): Promise<Record<string, StoredSession>> {
    try {
      const data = await fs.readFile(this.filePath, "utf8");
      return JSON.parse(data) as Record<string, StoredSession>;
    } catch (error: any) {
      if (error && error.code === "ENOENT") {
        return {};
      }
      throw error;
    }
  }

  private async writeStore(store: Record<string, StoredSession>): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(store, null, 2), "utf8");
  }

  private offlineSessionId(shop: string): string {
    if (shop.startsWith(OFFLINE_PREFIX)) {
      return shop;
    }
    return `${OFFLINE_PREFIX}${shop}`;
  }
}
