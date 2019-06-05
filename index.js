/*
* @file Web3 Security2Go
* @author Thomas Haller <thomas.haller@lab10.coop>
* @version 0.1
*/

const web3utils = require('web3-utils');
const util = require('util');
const Tx = require('ethereumjs-tx');

function toHex(nonHex, prefix = true) {
    let temp = nonHex.toString('hex');
    if (prefix) {
      temp = `0x${temp}`;
    }
    return temp;
};

function toHexString(byteArray) {
    var s = '0x';
    byteArray.forEach(function(byte) {
      s += ('0' + (byte & 0xFF).toString(16)).slice(-2);
    });
    return s;
  }

function isError(code) {
    if (code[0] == 0x90 && code[1] == 0)
        return false;
    return true;
}

function getPublicKey_function(args, callback) {
    const card = args.card;
    card.sendCommand(args.command, function(response) {
        if (response.length == 2) {
            if (response[0] == 0x69) {
                if (response[1] == 82) {
                card.logSigning('Maximal number of key import calls exceeded (Security status not satisfied)');
                } else if (response[1] == 85) {
                card.logSigning('Not authenticated with PIN (Condition of use not satisfied)');
                }
            }
            if (response[0] == 0x6a && response[1] == 0x88) {
                card.logSigning('Key slot with given index is not available')
            }
        } else if (response.length == 75) {
            //var sec1EncodedPublicKey =  response.slice(8, 64);
            //card.logSigning('response: ' + response);
            card.logSigning('result_code: ' + response[73] + ' ' + response[74]);
            //card.logSigning('Public key:' + keyIndex + ':' + toHexString(publicKey));
            var buffer = response.slice(9, 64 + 9);
            //var bufferHex = toHexString(buffer);
            callback(null, buffer);
        }
        else {
            card.logSigning('Unknown response: length: ' + response.length + ' - ' + response);
        }
    });
}

/**
 * 
 * @param {byte[]} errorCode 
 */
function getGenericErrorAsString(errorCode) {
    if (errorCode[0] == 0x90 && errorCode[1] == 0)
        return "Success";
    if (errorCode[0] == 0x64)
        return "Operation failed (" + errorCode[1] + ")";
    if (errorCode[0] == 0x67 && errorCode[1] == 0)
        return "Wrong length";
    if (errorCode[0] == 0x6A && errorCode[1] == 0x86)
        return "Incorrect parameters P1/P2";
    if (errorCode[0] == 0x6D && errorCode[1] == 0)
        return "Instruction code is not supported or invalid or application has not selected with the SELECT APP command";
    if (errorCode[0] == 0x6E && errorCode[1] == 0)
        return "Class not supported";
    if (errorCode[0] == 0x6F && errorCode[1] == 0)
        return "Unknown Error";
    
    return "ErrorCode Unknown";
}

/*
* Sends raw byte commands to the card and receives the response.
* sends the always required SelectApp command in advance.
* 
* @param {Security2GoCard} card object
* @param {bytes} a raw byte[] with the netto data.
* @param {receiveHandler} callback once the operation is finished.
*/
function sendCommand(card, bytes, receiveHandler = null) {
    var maxResponseLength = 128;
    card.logSigning('connecting...');
    this.reader.connect({}, function(err, protocol) {
        if (err) {
            console.error('Connecting Error:' + err);
        } else {
            protocol = card.PROTOCOL_ID;
            card.logSigning('protocol:' + protocol);
            var selectAppIncldingCommand = [0x00, 0xA4, 0x04, 0x00, 0x0D, /* start of body*/ 0xD2, 0x76, 0x00, 0x00, 0x04, 0x15, 0x02, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01 /* end of body */, 12];
            card.reader.transmit(new Buffer(selectAppIncldingCommand), maxResponseLength, protocol, function(err, data) {
                card.logSigning('select App Completed');
                if (err) {
                    console.error(err);
                } else {
                    //todo: validate result.
                    card.reader.transmit(new Buffer(bytes), maxResponseLength, protocol, function(err, data) {
                        if (err) {
                            //todo: interprate error here ?
                            card.logSigning('Error on transmitting')
                            card.logSigning(err);
                            return [];
                        } else {
                            card.logSigning('Data received', data);
    
                            //asume all 2 byte results are errors ?!
                            if (data.length == 2 && isError(data)) {
                                console.error('Received Data is Error received: ' + getGenericErrorAsString(data));
                            }
                            
                            card.logSigning(receiveHandler);
                            //reader.close();
                            //pcsc.close();
                            if (receiveHandler != null) {
                                receiveHandler(data);
                            }
                        }
                    });   
                }                 
            });
        }
    });
}


function selectApp(card, response) {
        
    var protocol = 2;
    card.logSigning('SELECT APP Handshaking with card...');
    var selectAppIncldingCommand = [0x00, 0xA4, 0x04, 0x00, 0x0D, /* start of body*/ 0xD2, 0x76, 0x00, 0x00, 0x04, 0x15, 0x02, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01 /* end of body */, 12];
    this.sendCommand(selectAppIncldingCommand, protocol, function (sendCommandresponse) {
        card.logSigning('SELECT APP Handshaking done');
        if (response != null) {
            response(sendCommandresponse);
        }
    });
};

async function generateSignatureRaw(card, bytes, keyIndex){

    function generateSignatureRaw_function(args, callback)  {

        const bytes = args.bytes;
        const keyIndex = args.keyIndex;
        const card = args.card;

        if (bytes.length != 32) {
            card.logSigning('message to sign needs to be 32 byte long.');
            return;
        }

        var messageBuffer = new ArrayBuffer(38);
        var messageBufferView = new Int8Array(messageBuffer);

        messageBufferView[1] = 0x18;
        messageBufferView[2] = keyIndex;
        messageBufferView[3] = 0x00;
        messageBufferView[4] = 0x20;        
        messageBufferView.set(bytes,5);
        
        card.logSigning('signing: ' + toHexString(messageBufferView));
        card.sendCommand(messageBuffer, function(sendCommandResponse, error) {
            if (sendCommandResponse) {
                card.logSigning("Signing: Got Response: " + toHexString(sendCommandResponse));
                if (sendCommandResponse[sendCommandResponse.length - 2] == 0x90 && sendCommandResponse[sendCommandResponse.length - 1] == 0){
                    card.logSigning("card Signature is a success!");
                    //todo: 
                    const resultBin = sendCommandResponse.slice(9, sendCommandResponse.length - 2);
                    const result =  web3utils.bytesToHex(resultBin);
                    callback(null, result)
                    return;
                } else {
                    console.error("Signing: not implmented signing response:" + toHexString(sendCommandResponse));
                }
            }
            if (error) {
                console.error("Signing Error: " + error);                
                callback(error, null);
            }
        });
    }

    try {
        var func = util.promisify(generateSignatureRaw_function);
        return await func({card: card, bytes: bytes, keyIndex: keyIndex});        
    } catch (error) {
        console.error('Why the Fuck do i get an error here ?')
        console.error(error)
    }
}


class Security2GoCard {

    constructor(reader) {

      this.reader = reader;
      this.PROTOCOL_ID = 2; //todo: dont know meaning yet...
      this.log_debug_signing = true;
      this.log_debug_web3 = true;
      //this.transactionNonce = undefined; //we keep track of the transaction nonce
    }

    logSigning(message) {
        if (this.log_debug_signing) {
          console.log(message)
        }
    };

    async getPublicKey(keyIndex=0) {
        var card = this;
        card.logSigning('getting key #' + keyIndex);
        var command= [0x00, 0x16,keyIndex, 0x00, 0x00];

        card.logSigning('response');
        //card.logSigning(responseFunction);
        
        var func = util.promisify(getPublicKey_function);

        return await func({card: this, command: command});
        //card.logSigning(responseFunction);
        //return new Promise(resolve => {});
    }

    async getAddress(keyIndex) {
        const publicKey = await this.getPublicKey(keyIndex);
        const publicKeyHex = web3utils.bytesToHex(publicKey)
        this.logSigning('publicKeyHex:');
        this.logSigning(publicKeyHex);
        let address = '0x' + web3utils.sha3(publicKeyHex).slice(26);
        this.logSigning('address');
        this.logSigning(address);
        return address;
    }

    async generateSignature(web3, rawTransaction, cardKeyIndex = 1, nonce) {

        const address = await this.getAddress(cardKeyIndex);
        this.logSigning('address');
        this.logSigning(address);

        if (!nonce) {
            nonce = await web3.eth.getTransactionCount(address);
        }

        // console.log(rawTransaction.from);
        // if (rawTransaction.from) {
        //     console.warn('rawTransaction raw' + address);
        //     rawTransaction.from = address;
        //     return;
        // }
        // else if (rawTransaction.from != address) {
        //     console.error('rawTransaction.from must be address of the s2g card. rawTransaction.from:' + rawTransaction.from + ' address: ' + address);
        //     return;
        // }
        // else {
        //     console.log('No problem with address found!');
        //     return;
        // }

        rawTransaction.nonce = nonce;

        const tx = new Tx(rawTransaction);
        
        const hashBytes = tx.hash(false)
        const hash = toHex(hashBytes, false);
        this.logSigning('hash');
        this.logSigning(hash);
        
        //todo: repeat and verify transaction until it we created a transaction that is valid.

        let serializedTx = '';
        let i = 0;

        const cardSig = await this.generateSignatureRaw(hashBytes, cardKeyIndex);
        
        do {
            if (i > 1) {
                const failure = 'no valid transaction could be calculated.'
                console.Error(failure);
                throw failure;
            }

            this.logSigning('tries to generate signature.');
        
            //const cardSig = await wrapper.generateSignature(1, hash.toString('hex'));
            
            this.logSigning('cardSig');
            this.logSigning(cardSig);
        
            let rStart = 6;
            let length = 2;
            const rLength = parseInt(cardSig.slice(rStart, rStart + length), 16);
            this.logSigning('rLength');
            this.logSigning(rLength);
            rStart += 2;
            const r = cardSig.slice(rStart, rStart + rLength * 2);
            this.logSigning('r');
            this.logSigning(r);
            console.assert(r.length == rLength * 2, 'r should be length ' + rLength * 2 + ' but has length ' + r.length);
        
            let sStart = rStart + rLength * 2 + 2;
            const sLength = parseInt(cardSig.slice(sStart, sStart + length), 16);
            this.logSigning('sLength');
            this.logSigning(sLength);
            
            sStart += 2;
            const s = cardSig.slice(sStart, sStart + sLength  * 2);
            
            this.logSigning('s');
            this.logSigning(s);
            console.assert(s.length == sLength * 2, 's should be length ' + sLength * 2 + ' but has length ' + s.length);
            
            tx.r = '0x' + r;
            tx.s = '0x' + s;

            //todo: learn more about "v"
            if (i == 0) {
                tx.v = '0x1b'
            } else {
                tx.v = '0x1c'
            }

            //this.logSigning('v');
            //this.logSigning(toHex(tx.v));
            
            //console.log('v: ' + toHex(tx.v));
        
            const tx2 = new Tx(tx);
            //console.log('v: ' + tx2.v);
            serializedTx = tx2.serialize();
            this.logSigning('serializedTx');
            this.logSigning(toHex(serializedTx));
            //card.logSigning('tx2.v', toHex(tx2.v));
            //this.logSigning(web3.eth.accounts.recoverTransaction(toHex(serializedTx)));
        
            i += 1;
          } while (web3.eth.accounts.recoverTransaction(toHex(serializedTx)).toLocaleLowerCase() !== address);

          //console.assert(i == 1, 'this transaction required ' + i + ' tries to create a valid transaction.');
          this.logSigning('serialized transaction:' + serializedTx);

          return toHex(serializedTx);
    }


    logWeb3(message) {
        if (this.log_debug_web3) {
            console.log(message)
        }
    }

    async signAndSendTransaction(web3, tx, cardKeyIndex = 1){
        
        const signature = await this.generateSignature(web3, tx, cardKeyIndex);
        const card = this;
        try {
            this.logWeb3('sending transaction');
            const txReceipt = await web3.eth.sendSignedTransaction(signature, (error, hash) => {
                if (error) {
                    console.error('Transaction failed!!');
                }
                if (hash) {
                    card.logWeb3('tx hash:' + hash);
                }
            });
            this.logWeb3('receipt: ' + txReceipt);
            return txReceipt;
        }
        catch (error) {
            //the following error occurs all the time.
            //Error: Transaction has been reverted by the EVM:
            //no idea why yet....
            console.error('Error:' + error);
            throw error;
        }
    }
  }

module.exports = {
    Security2GoCard
}