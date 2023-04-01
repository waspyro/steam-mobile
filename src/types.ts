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