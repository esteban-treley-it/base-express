import DB from "@/services/db";
import { Request } from "express";
import { UserTokenData } from "../data/users";

export interface AppRequest<T = any> extends Request {
    db?: DB,
    body: T;
    user?: UserTokenData
}