import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import deploymentsRouter from "./deployments";
import adminRouter from "./admin";
import proxyRouter from "./proxy";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(deploymentsRouter);
router.use(adminRouter);
router.use(proxyRouter);

export default router;
