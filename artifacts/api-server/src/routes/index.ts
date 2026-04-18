import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import deploymentsRouter from "./deployments";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(deploymentsRouter);
router.use(adminRouter);

export default router;
