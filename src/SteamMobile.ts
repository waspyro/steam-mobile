import SteamSession from "@waspyro/steam-session";
import totp from 'steam-totp'
import {ConfirmationDetails, SteamMobileConstructorParams, SteamMobileFromRestoredSessionParams} from "./types";
import {getSuccessfulJsonFromResponse} from "@waspyro/steam-session/dist/common/utils";
import {MalformedResponse} from "@waspyro/steam-session/dist/constructs/Errors";
import {obj} from "@waspyro/steam-session/dist/common/types";
import {undici} from "@waspyro/steam-session";
import {randomUUID, createHash, randomBytes} from "crypto";

export default class SteamMobile {
    secrets: {shared: string, identity: string} = {shared: null, identity: null}
    deviceid: string

    constructor(
        public session: SteamSession,
        {shared = null, identity = null, deviceid}: SteamMobileConstructorParams
    ) {
        if(session.env.websiteId !== 'Mobile') throw new Error('SteamSession should use mobile env')
        this.deviceid = deviceid || this.session.env.meta.deviceid
        this.session = session
        this.secrets.shared = shared
        this.secrets.identity = identity
        Patch.call(this, ['getConfirmations', 'actOnConfrimations'])
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

    acceptAllConfirmations = () =>
        this.getConfirmations()
        .then(confirmations =>
        this.actOnConfrimations(confirmations, true)
        .then(success =>
        ({confirmations, success})
    ))

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

    get Refresher() {
        if(!this.secrets.shared) return this.session.tokenRefresher
        return SteamSession.MobileSessionRefresher(this.session, this.secrets.shared)
    }

    static fromRestoredSession = async (params: SteamMobileFromRestoredSessionParams) => {
        if(!params.refresher && params.login && params.password)
            params.refresher = SteamSession.CredentialsRefresher(params.login, params.password, params.shared)
        return SteamSession.restore(params).then(session => new SteamMobile(session, params))
    }

    static genericDeviceID = (...saltData: string[]) => {
        const salt = saltData.join('')
        if(!salt) throw new Error('salt should not be empty')
        return createHash('sha1').update(salt).digest('hex')
            .replace(/(\w{8})(\w{4})(\w{4})(\w{4})(\w{12}).*$/, '$1-$2-$3-$4-$5')
            .toUpperCase()
    }

    static getSalt = () => process.env.STEAM_TOTP_SALT || randomBytes(8).toString('hex')

    static randomDeviceID = () => randomUUID().toUpperCase()

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

function Patch(this: SteamMobile, keysToPatch: string[]) {
    const keys = keysToPatch.map(k => [k, this[k]])
    for(const [key] of keys) {
        this[key] = async (...args) => {
            if(!this.session.steamid) await this.session.refreshCookies()
            if(!this.deviceid) {
                this.deviceid = SteamMobile.genericDeviceID(this.session.steamid, SteamMobile.getSalt())
                this.session.env.meta.deviceid = this.deviceid
                this.session.updateEnv()
            }
            for(const [key, origin] of keys) this[key] = origin
            return this[key](...args)
        }
    }
}