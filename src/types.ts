import {SteamSessionRestoreConstructorParams} from "@waspyro/steam-session/dist/common/types";

export type ConfirmationDetails = { //todo: market listing, trade ets... confirmations type as const
    "type": number,
    "type_name": string,
    "id": string,
    "creator_id": string,
    "nonce": string,
    "creation_time": number,
    "cancel": string,
    "accept": string,
    "icon": string,
    "multi": boolean,
    "headline": string,
    "summary": string[],
    "warn": null | string
}

export type SteamMobileConstructorParams = {
    shared?: string,
    identity?: string,
    deviceid?: string,
}

export type SteamMobileFromRestoredSessionParams =
    SteamSessionRestoreConstructorParams
    & SteamMobileConstructorParams
    & {login?: string, password?: string}