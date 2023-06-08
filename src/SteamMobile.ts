import SteamSession from "steam-session";
import * as crypto from "crypto";
import totp from 'steam-totp'
import {ConfirmationDetails} from "./types";
import {getSuccessfulJsonFromResponse} from "steam-session/dist/common/utils";
import {MalformedResponse} from "steam-session/dist/constructs/Errors";
import {obj} from "steam-session/dist/common/types";
import {undici} from "steam-session";

export default class SteamMobile {
    secrets: {shared: string, identity: string} = {shared: null, identity: null}
    deviceid: string

    constructor(
        public session: SteamSession,
        {shared = null, identity = null, deviceid} = {} as {shared?: string, identity?: string, deviceid?: string}
    ) {
        if(session.env.websiteId !== 'Mobile') throw new Error('SteamSession should use mobile env')
        if(!session.steamid) throw new Error('SteamSession missing steamid property. ' +
            'Set steamid or refreshToken manually or just logon')
        this.secrets.shared = shared
        this.secrets.identity = identity
        this.deviceid = deviceid || SteamMobile.generateDeviceID(session.steamid)
    }

    getConfirmations(): Promise<ConfirmationDetails[]> {
        return this.session.authorizedRequest(SteamMobile.url('getlist', this.generateRequestParams('list')))
            .then(getSuccessfulJsonFromResponse)
            .then(r => {
                if(r.conf) return r.conf
                else throw new MalformedResponse(r, 'conf')
            })
    }

    actOnConfrimations(confirmations: ConfirmationDetails[], confirm: boolean = true): Promise<boolean> {
        if(!confirmations.length) return Promise.resolve(true)
        const params = this.generateRequestParams('accept', {op: confirm ? 'allow' : 'cancel'})
        const url = SteamMobile.url('multiajaxop', params)
        const body = SteamMobile.createFormDataWithConfirmations(confirmations)
        return this.session.authorizedRequest(url, {body, method: 'POST'})
            .then(getSuccessfulJsonFromResponse)
            .then(() => true).catch(() => false)
    }

    getTwoFactorCode = (): string => {
        return this.#usedCode = totp.generateAuthCode(this.secrets.shared)
    }

    #usedCode = ''
    getTwoFactorCodeUniq(): Promise<string> {
        const oldCode = this.#usedCode
        const newCode = this.getTwoFactorCode()
        return newCode === oldCode
            ? new Promise(resolve => setTimeout(() => resolve(this.getTwoFactorCodeUniq()), 30000))
            : Promise.resolve(newCode)
    }

    private generateRequestParams = (tag: string, assignTo: obj = {}) => {
        const time = Math.floor(Date.now() / 1000)
        assignTo.p = this.deviceid
        assignTo.a = this.session.steamid
        assignTo.k = totp.generateConfirmationKey(this.secrets.identity, time, tag)
        assignTo.t = time
        assignTo.m = 'react'
        assignTo.tag = tag
        return assignTo
    }

    static generateDeviceID(steamid: string, salt: string = '') {
        if(!steamid) throw new Error('steamid should not be empty')
        return crypto.createHash('sha1').update(steamid + salt).digest('hex')
            .replace(/^([0-9a-f]{8})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{12}).*$/, '$1-$2-$3-$4-$5')
            .toUpperCase()
    }

    static getSalt = () => process.env.STEAM_TOTP_SALT || crypto.randomBytes(8).toString('hex')

    static url = (path: string, params?: obj) => {
        const url = new URL(path, 'https://steamcommunity.com/mobileconf/')
        if(params) for(const k in params) url.searchParams.set(k, params[k])
        return url
    }

    private static createFormDataWithConfirmations = (confs: ConfirmationDetails[]) => {
        const fd = new undici.FormData()
        for(const conf of confs) {
            fd.append('cid[]', conf.id)
            fd.append('ck[]', conf.nonce)
        }
        return fd
    }

}
