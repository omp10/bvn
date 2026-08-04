import mongoose from "mongoose";
import { env } from "../config/env.js";

export async function connectDb(url = env.mongoUrl): Promise<void> {
  mongoose.set("strictQuery", true);
  await mongoose.connect(url, { serverSelectionTimeoutMS: 5000 });
  // The unique indexes are load-bearing: they are what makes Start Trip and
  // attendance marking idempotent, so build them at boot rather than lazily.
  await mongoose.syncIndexes();
}

export const disconnectDb = () => mongoose.disconnect();
