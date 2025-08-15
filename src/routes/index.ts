import { Router } from "express";

import authRouter from "./auth";
import { handleRequest } from "@/services/request";
import { healthCheck } from "@/controller/health";

export const router = Router();

router.use("/auth", authRouter);
router.get("/health", handleRequest(healthCheck))

export default router;