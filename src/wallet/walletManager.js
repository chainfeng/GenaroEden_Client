const fs = require('fs')
const path = require('path')
const os = require('os')
const low = require('lowdb')
const FileSync = require('lowdb/adapters/FileSync')
const keytar = require('keytar')
const Wallet = require('ethereumjs-wallet')
const hdkey = require('ethereumjs-wallet/hdkey')
const Tx = require('ethereumjs-tx')

const KEYCHAIN_WALLET = 'network.genaro.eden.wallet'
const WEB3PROVIDER = 'https://ropsten.infura.io/wYBhtj2SSUB7qlztqEjx'
const CHAINID = 3

var isFirstTime = false
const dbFolder = path.join(os.homedir(), ".eden")
if (!fs.existsSync(dbFolder)){
    fs.mkdirSync(dbFolder)
    isFirstTime = true
}

const dbPath = path.join(dbFolder, "wallets.json")
const adapter = new FileSync(dbPath)
const db = low(adapter)

db.defaults({ wallet: [] }).write()

function generateWalletName() {
    const names = new Set()
    db.get('wallet').value().forEach(e => {
        names.add(e.name)
    })
    var i = 0
    while(true) {
        i ++
        var tmpname = `Account ${i}`
        if(!names.has(tmpname)) {
            return tmpname
        }
    }
}
/*
  {
    name: 'wallet 1',
    created: 1321321,
    address: '009b5109f8f0ef4d360f10bd51358e76f042d1a1',
    source: 'imported' // derieved
  }
*/
function loadWallet() {
    return new Promise((resolve, reject) => {
        const wallets = db.get('wallet').cloneDeep().sortBy(item => -item.created).value()
        let count = wallets.length
        if(count === 0) {
            resolve([])
        } else {
            wallets.forEach(w => {
                keytar.getPassword(KEYCHAIN_WALLET, w.address).then(v3str => {
                    count --
                    w.v3 = JSON.parse(v3str)
                    w.address = w.v3.address
                    w.rawWallet = null
                    if(count === 0) {
                        resolve(wallets)
                    }
                }).catch( e => reject(e) )
            })
        }
    })
}

function loadSingleWallet(address, password) {
    return new Promise((resolve, reject) => {
        keytar.getPassword(KEYCHAIN_WALLET, address).then(v3str => {
            const w = Wallet.fromV3(v3str, password)
            resolve(w)
        }).catch( e => reject(e) )
    })
}

function saveWallet(wa, name, pass) {
    return new Promise((resolve, reject) => {
        const v3 = wa.toV3(pass)
        const address = v3.address

        const found = db.get('wallet').find({ address: address }).value()
        if(found) {
            reject({message: `address ${address} already exists. Please delete it first.`})
            return
        }
        keytar.setPassword(KEYCHAIN_WALLET, v3.address, JSON.stringify(v3)).then(() => {
            db.get('wallet').push({
                name,
                created: Date.now(),
                address
            }).write()
            resolve()
        })
    })
}

function importFromV3Json(json, password, name) {
    return new Promise((resolve, reject) => {
        var w = Wallet.fromV3(json, password)
        saveWallet(w, name, password).then(() => resolve()).catch(e => reject(e))
    })
}

function importFromMnemonic(mnemonic, password) {
    return new Promise((resolve, reject) => {
        // compatible with metamask/jaxx
        const bip39 = require('bip39')
        const seed = bip39.mnemonicToSeed(mnemonic)
        let wallet = hdkey.fromMasterSeed(seed).derivePath(`m/44'/60'/0'/0`).deriveChild(0).getWallet()

        //const ss = wallet.getAddress().toString()
        const ss2 = wallet.getAddress().toString('hex')
        saveWallet(wallet, generateWalletName(), password).then(() => resolve()).catch(e => reject(e))
    })
}

function importFromPrivateKey() {
    // TODO:
}
function initRawWallet(v3, pass) {
    return Wallet.fromV3(v3, pass)
}

export default{
    loadWallet,
    importFromV3Json,
    importFromMnemonic,
    initRawWallet
}
  