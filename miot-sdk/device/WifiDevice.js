/**
 * @export public
 * @doc_name 插件网络操作模块
 * @doc_index 3
 * @doc_directory device
 * @module miot/device
 * @description
 * 设备相关 API
 * IDeviceWifi 当前设备网络操作实例对象，用于发送设备网络操作请求等
 *
 * @example
 * ...
 * //wifi方法 e.g RPC请求
 * Device.getDeviceWifi().callMethod('method_name', params)
 *  .then(res => {//here is the success result})
 *  .catch(err => {//error happened})
 * ...
 * 其余具体使用请参考具体API文档，出现问题请查看：[按功能-概述](https://iot.mi.com/new/doc/05-%E7%B1%B3%E5%AE%B6%E6%89%A9%E5%B1%95%E7%A8%8B%E5%BA%8F%E5%BC%80%E5%8F%91%E6%8C%87%E5%8D%97/04-%E8%AE%BE%E5%A4%87%E7%AE%A1%E7%90%86/02-%E6%8C%89%E5%8A%9F%E8%83%BD/01-%E6%A6%82%E8%BF%B0.html)
 * 
 * 名词解释：
 * 云端：特指小米iot云平台，接入小米的设备，都是指接入小米iot云平台的设备，设备一般都可以直接或者间接和iot云平台通讯
 * 本地局域网：指设备和手机在同一个局域网时，手机可直接与设备通讯，读取设备数据，本地局域网时，一般通过udp协议来与设备进行交互
 * 透传：服务端给客户端什么数据，客户端就返回给插件什么数据。而且，callMethod等请求，固件到服务端的数据也是透传：固件给什么数据到服务端，服务端就给什么数据到客户端
 *
 *  **注意：callMethod，loadProperties等几个直接和设备打交道的方法，排查错误的流程一般为：抓包查看请求参数是否没问题，插件和固件端联调看看固件端是否有收到正确的参数并返回正确的值！**
 */
import { DeviceEventEmitter } from "react-native";
import native, { NativeTimer, PackageExitAction, Properties } from '../native';
import { BasicDevice, _find_device } from './BasicDevice';
const INTERVAL_SUBSCRIBE_MSG_SECONDS = (2 * 60 + 50);//2'50"
/**
 * 设备网络访问控制类
 * @interface
 */
export default class IDeviceWifi {
    // @native begin
    set deviceID(deviceID) {
        Properties.of(this).deviceID = deviceID;
    }
    //@ native end
    /**
     * 获取设备ID，same as Device.deviceID
     * @member
     * @deprecated since 10032,请使用Device.deviceID;
     * @type {string}
     * @example
     * import {Device} from 'miot'
     * ...
     * let did = Device.getDeviceWifi().deviceID
     */
    get deviceID() {
        //@native => ""
        return Properties.of(this).deviceID;
    }
    /**
    * @typedef {Object} NetworkInfo
    * @property {string} bssid  wifi 的mac地址
    * @property {number} rssi   wifi的原始信号强度，android和iOS为保持一致，不要使用。
    * @property {string} ssid  wifi 的名称
    * @property {number} wifiStrength  wifi的信号强度，adnroid和iOS保持一致后的，推荐使用。正常wifi/combo设备返回0-100之间的值，蓝牙设备返回0
    */
    /**
     * 实时获取设备的网络信息包括网络强度，此方法一般情况下不走reject
     * @param {String} did 设备id
     * @method
     * @returns {Promise<NetworkInfo>}
     *      resolve：NetworkInfo
     *      reject：不会走reject
     */
    readDeviceNetWorkInfo(did) {
        //@native :=> promise []
        return new Promise((resolve, reject) => {
            native.MIOTDevice.readDeviceNetWorkInfo(did, (isSuccess, result) => {
                if (isSuccess) {
                    let wifiStrength = 0;
                    let RSSI_MAX = -30;
                    let RSSI_MIN = -85;
                    if (result.rssi == 0 || result.rssi <= RSSI_MIN) {
                        wifiStrength = 0;
                    } else if (result.rssi >= RSSI_MAX) {
                        wifiStrength = 100;
                    } else {
                        wifiStrength = (Math.abs(RSSI_MIN) + result.rssi) * 100 / (RSSI_MAX - RSSI_MIN);
                    }
                    // 排错处理
                    if (wifiStrength > 100) {
                        wifiStrength = 100;
                    }
                    result.wifiStrength = wifiStrength;
                    resolve(result);
                } else {
                    reject(result);
                }
            })
        });
        //@native end
    }
    /**
     * 加载属性数据，
     * 内部调用get_prop 方法,Android会依据当前环境选择从本地局域网或者云端获取, iOS因获取不到wifi信息，会默认走云端获取，并将返回数据写成{key:value}格式
     * @method
     * @param {*} propNames 属性名称，若propNames长度小于一个，则走reject。普通设备传：prop.propertyName, miot-spec设备传prop.siid.piid
     * @returns {Promise<Map>} Map<name, value> 
     * @example
     * Device.getDeviceWifi().loadProperties("prop.light", "prop.2.1").then(map=>{
     *  const a = map.get("a")
     *  const b = map.get("b")
     * })
     *
     */
    loadProperties(...propNames) {
        if (propNames.length < 1) {
            return Promise.reject();
        }
        return this.callMethod("get_prop", propNames).then((res => {
            const map = new Map();
            if (res.result) {
                propNames.forEach((n, i) => map.set(n, res.result[i]));
            }
            return map;
        }));
    }
    /**
     * 强制从云端加载属性数据
     * 内部调用get_prop 方法, 并将返回数据写成{key:value}格式
     * @method
     * @param {*} propNames 属性名称，若propNames长度小于一个，则走reject
     * @returns {Promise<Map>} Map<name, value> 同上
     *
     */
    loadPropertiesFromCloud(...propNames) {
        if (propNames.length < 1) {
            return Promise.reject();
        }
        return this.callMethodFromCloud("get_prop", propNames).then((res => {
            const map = new Map();
            if (res.result) {
                propNames.forEach((n, i) => map.set(n, res.result[i]));
            }
            return map;
        }));
    }
    /**
     * 调用设备方法
     * Android里面，若与设备通信处于同一个 wifi 下会使用局域网直接传输数据，如果不在同一个 wifi 下由云端转发请求。iOS里面，因获取不到wifi信息，一般默认走云端
     * @param {string} method  方法名
     * @param {json} args  参数
     * @param {json} extraPayload  额外参数，根据设备需求设定。在payload数据中设置额外参数，暂时只提供给绿米网关使用，如有需求，请联系米家。
     * @return {Promise<json>} {code:0,result:{},id:""} 透传
     * @example
     * Device.getDeviceWifi().callMethod('getProps', [prop1,prop2])
     *  .then(res => console.log('success:', res))
     *  .catch(err => console.error('failed:', err))
     * //对应payload参考：
     * //{'method': 'getProps', 'params':[prop1,prop2]}
     *
     * Device.getDeviceWifi().callMethod('getProps', [prop1,prop2], {sid:Device.deviceID, 'key1':'xxxx'})
     *  .then(res => console.log('success:', res))
     *  .catch(err => console.error('failed:', err))
     * //对应payload参考：
     * //{'method': 'getProps', 'params':[prop1,prop2], 'sid':'xxxxx', 'key1': 'xxxx'}
     *
     */
    callMethod(method, args, extraPayload = {}) {
        //@native :=> promise {}
        //@mark andr done
        return new Promise((resolve, reject) => {
            console.log("device-->callMethod", this.deviceID, this);
            native.MIOTDevice.callMethod(this.deviceID, method,
                native.isAndroid ? ((typeof (args) === "string") ? args : JSON.stringify(args)) : args,
                native.isAndroid ? ((typeof (extraPayload) === "string") ? extraPayload : JSON.stringify(extraPayload)) : extraPayload,
                (ok, res) => {
                    if (ok) {
                        resolve(res)
                    } else {
                        reject(res)
                    }
                })
        })
        //@native end
    }
    /**
     * 强制通过云端调用设备方法
     * Android同callMethod函数不在同一个wifi下的情况，iOS一般情况下等于callMethod方法
     * @param {string} method  方法名
     * @param {json} args 参数
     * @param {json} extraPayload  (API Level 10027新增)额外参数，根据设备需求设定。在payload数据中设置额外参数
     * @return {Promise<json>} 请求成功返回 {code:0,result:{} } 透传
     *
     */
    callMethodFromCloud(method, args, extraPayload = {}) {
        //@native :=> promise {}
        //@mark andr done
        return new Promise((resolve, reject) => {
            if (native.isAndroid) {
                native.MIOTDevice.callMethodFromCloud(this.deviceID, method,
                    ((typeof (args) === "string") ? args : JSON.stringify(args)),
                    ((typeof (extraPayload) === "string") ? extraPayload : JSON.stringify(extraPayload)),
                    (ok, res) => {
                        if (ok) {
                            resolve(res)
                        } else {
                            reject(res)
                        }
                    })
            } else {
                //need deviceID
                native.MIOTDevice.callMethodForceWay(method, args, 2, extraPayload, (ok, res) => {
                    if (ok) {
                        resolve(res)
                    } else {
                        reject(res)
                    }
                })
            }
        })
        //@native end
    }
    /**
     * 本地调用设备方法，会直接根据设备ip和端口，发送udp请求，直接和设备通讯。**注意：如果不在同一个路由器，rpc会失败，而不会自动的走云端的方法，使用此方法前，可通过下面的localPing去判断是否是同一个局域网**
     * @param {string} method  方法名
     * @param {json} args 参数
     * @param {json} extraPayload  (API Level 10027新增)额外参数，根据设备需求设定。在payload数据中设置额外参数
     * @return {Promise<json>} 请求成功返回 {code:0,result:{} } 透传
     *
     */
    callMethodFromLocal(method, args, extraPayload = {}) {
        //@native :=> promise {}
        //@mark andr done
        return new Promise((resolve, reject) => {
            if (native.isAndroid) {
                native.MIOTDevice.callMethodFromLocal(this.deviceID, method,
                    ((typeof (args) === "string") ? args : JSON.stringify(args)),
                    ((typeof (extraPayload) === "string") ? extraPayload : JSON.stringify(extraPayload)),
                    (ok, res) => {
                        if (ok) {
                            resolve(res)
                        } else {
                            reject(res)
                        }
                    })
            } else {
                //need deviceID
                native.MIOTDevice.callMethodForceWay(method, args, 1, extraPayload, (ok, res) => {
                    if (ok) {
                        resolve(res)
                    } else {
                        reject(res)
                    }
                })
            }
        })
        //@native end
    }
    //@native begin
    /**
     * 
     * @param {json} payload  数据格式 @{@"id" : @(id), @"method" : @"method", @"params" : originData, @"other" : other}
     * @param {number} length  每一帧的长度
     * @param {string} type   类型，例如“scene”
     * @retun {Promise<json>} 请求成功返回 {code:0,result:{} }
     * 请求失败返回 {code:xxx, message:xxx}
     */
    sendKeyFramePayLoad(payload, length, type) {
        return new Promise((resolve, reject) => {
            if (native.isAndroid) {
                native.MIOTDevice.sendKeyFramePayLoad((typeof (payload) === "string") ? payload : JSON.stringify(payload), length, type,
                    (ok, res) => {
                        if (ok) {
                            resolve(res)
                        } else {
                            reject(res)
                        }
                    })
            } else {
                //need deviceID
                //args._miot_device_id = this.deviceID;
                native.MIOTDevice.sendKeyFramePayLoad(payload, length, type, (ok, res) => {
                    if (ok) {
                        resolve(res)
                    } else {
                        reject(res)
                    }
                })
            }
        })
    }
    // @native end
    /**
     * ping 操作 检查设备本地局域网通信是否可用，如果某个功能需要强制走本地,又不确定它是否在同一个局域网下，可以先调用此方法检查。
     * @returns {Promise<boolean>}
     *
     * @example
     * Device.getDeviceWifi().localPing()
     *  .then(res => console.log('success:', res))
     *  .catch(err => console.log('failed:', err))
     */
    localPing() {
        //@native :=> promise {}
        //@mark andr done
        return new Promise((resolve, reject) => {
            var callback = ret => {
                if (ret) {
                    resolve(ret)
                } else {
                    reject(ret)
                }
            }
            if (native.isAndroid) {
                native.MIOTDevice.localPingWithCallback(this.deviceID, callback)
            } else {
                native.MIOTHost.localPingWithCallback(callback)
            }
        });
        //@native end
    }
    /**
     * 订阅设备消息。指插件端监听设备属性变化或者事件执行的消息。比如：洗衣机洗完衣服了，需要手机发出“嘀嘀”的声音通知用户，我们就可以监听衣服洗完了这个事件。
     * 订阅设备消息的前提是：设备属性变化/设备事件 正确上报。你需要在：https://iot.mi.com/productDetail_new.html#/pushMessage?model=yourmodel 里面正确的配置消息推送，然后固件端实现消息推送协议。最后在客户端使用此方法订阅。
     * 具体使用办法，错误排查和注意点可参考iot平台的设备订阅文档：https://iot.mi.com/new/doc/05-%e7%b1%b3%e5%ae%b6%e6%89%a9%e5%b1%95%e7%a8%8b%e5%ba%8f%e5%bc%80%e5%8f%91%e6%8c%87%e5%8d%97/04-%e8%ae%be%e5%a4%87%e7%ae%a1%e7%90%86/02-%e6%8c%89%e5%8a%9f%e8%83%bd/07-%e8%ae%be%e5%a4%87%e8%ae%a2%e9%98%85.html
     * @method
     * @param {...string} propertyOrEventNames -在开发平台上声明的 prop 与 event 名，注意消息格式为：prop.xxxxx 或者 event.xxxxx ，表示订阅的是设备的属性变化，还是设备的事件响应.如果是miot-spec设备。则为prop.siid.piid，event.siid.eiid
     * @example
     * import {Device, DeviceEvent} from 'miot'
     * ...
     * //监听 属性变化和事件响应
     * const listener = DeviceEvent.deviceReceivedMessages.addListener(
     * (device, messages)=>{
     *  if(messages.has('prop.color')){
     *    console.log('获取到属性变化：',messages.get('prop.color'));
     *     ...
     *  } else if (messages.has('event.powerOn')){
     *    console.log('获取到事件响应：',messages.get('event.powerOn'));
     *    ...
     *  }
     *  ...
     * })
     * ...
     *   //添加订阅：属性变更和事件响应
     * let msgSubscription = null;
     * Device.getDeviceWifi().subscribeMessages('prop.color','event.powerOn')
     * .then(subcription => {
     *    //call this when you need to unsubscribe the message
     *   msgSubscription = subcription;
     * })
     * .catch(() => console.log('subscribe failed'))
     * ...
     *
     * ...
     * //unsubscribe the props
     * msgSubscription&&msgSubscription.remove();
     * listener&&listener.remove();
     *
     * @returns {Promise<EventSubscription>}
     *      resolve：EventSubscription 订阅监听
     *      reject：订阅ID或者空
     */
    subscribeMessages(...propertyOrEventNames) {
        //@native :=> promise this
        if (propertyOrEventNames.length < 1) {
            return Promise.reject("arguments is empty");
        }
        const { _msgset } = Properties.of(this);
        if (!_msgset) {
            return Promise.reject("cann't subscribe any messages");
        }
        propertyOrEventNames.forEach(n => _msgset.add(n));
        return (new Promise((resolve, reject) => {
            native.MIOTDevice.subscribeMessages(this.deviceID, propertyOrEventNames, (ok, subscribeId) => {
                if (ok) {
                    const unsub = native.MIOTDevice.unsubscribeMessages;
                    const stop = cache => {
                        if (cache.deviceMessages) {
                            const def = cache.deviceMessages.get(subscribeId);
                            cache.deviceMessages.delete(subscribeId);
                            if (def) {
                                cache.deviceUsingSubscribers.delete(def.lastId);
                                unsub && unsub(this.deviceID, propertyOrEventNames, def.lastId, _ => { });
                                //native.ClearTimeout(def.timer);
                                def.timer.remove();
                            }
                        }
                    }
                    if (unsub) {//区分 android ios，ios 没有实现unsubscribeMessages内部重复订阅
                        PackageExitAction.register(stop, cache => {
                            if (!cache.deviceMessages) {
                                cache.deviceMessages = new Map();
                                cache.deviceUsingSubscribers = new Set();
                            }
                            cache.deviceUsingSubscribers.add(subscribeId);
                            const def = {
                                lastId: subscribeId
                            };
                            def.timer = NativeTimer.addListener(() => {
                                if (!cache.deviceMessages.has(subscribeId)) {
                                    return;
                                }
                                native.MIOTDevice.subscribeMessages(this.deviceID, propertyOrEventNames, (ok, newId) => {
                                    if (ok && newId) {
                                        cache.deviceUsingSubscribers.add(newId);
                                        cache.deviceUsingSubscribers.delete(def.lastId);
                                        def.lastId = newId;
                                    }
                                });
                                return "continue";
                            }, INTERVAL_SUBSCRIBE_MSG_SECONDS);
                            cache.deviceMessages.set(subscribeId, def);
                        })
                    }
                    resolve({
                        remove() {
                            if (unsub) {
                                stop(native.LocalCache);
                            }
                        }
                    });
                }
                !ok && reject(subscribeId);
            })
        }));
        //@native end
    }
    /**
     * 获取当前设备固件版本信息。蓝牙设备请不要用此方法，需要用BTDevice.getVersion()方法。
     * 万一为空,你可以使用Service.smarthome.checkDeviceVersion()来获取版本（curVersion字段）。
     * @return {Promise<any>}
     *      resolve：version
     *      reject：null
     */
    getVersion() {
        //@native :=> promise {}
        return new Promise((resolve, reject) => {
            native.MIOTDevice.getVersion(false, (ok, data) => {
                if (ok) {
                    Properties.of(this).version = data;
                    resolve(data);
                    return;
                }
                reject(data);
            });
        });
        //@native end
    }
    /**
     * 设备固件版本信息
     * @typedef DeviceVersion
     * @property {boolean} isUpdating - 是否ota升级中 为true时，otaState才有效
     * @property {boolean} isLatest - 是否是最新版本
     * @property {boolean} isForce - 是否强制升级
     * @property {boolean} hasNewFirmware - 是否有新固件
     * @property {string} curVersion - 当前固件版本
     * @property {string} newVersion - 新固件版本
     * @property {string} description - 描述
     *
     */
    /**
     * 升级设备固件.可以和Service.smarthome.getAvailableFirmwareForDids搭配使用，先检查是否有可用版本，如果有，展示信息给用户，让用户确认，或者直接升级。
     * /home/devupgrade
     * @method
     * @example
     * Device.getDeviceWifi().startUpgradingFirmware()
     *  .then(res => console.log('success:', res))
     *  .catch(err => console.log('failed:', err))
     * @return {Promise<DeviceVersion>} {}
     *      resolve：DeviceVersion
     *      reject：{code: xxx, message: xxx} 其他code:网络错误/服务端错误
     */
    startUpgradingFirmware() {
        //@native :=> promise {}
        return new Promise((resolve, reject) => {
            const { did, pid } = Properties.of(this);
            native.MIOTRPC.standardCall("/home/devupgrade", { did, pid }, (ok, res) => {
                if (!ok) {
                    return reject(res);
                }
                const { updating, isLatest, description, force, curr, latest } = res;
                resolve({
                    isUpdating: updating, isLatest, isForce: force, description,
                    curVersion: curr, newVersion: latest, hasNewFirmware: updating ? false : !isLatest
                })
            });
        });
        //@native end
    }
    /**
     * 为设备固件升级失败添加自定义的errorCode与错误提示信息的索引，以便给用户以友好易懂的错误提示，暂时仅供石头扫地机使用。注意 分享过来的设备是无法进行固件升级的，所以此时此方法也无效。
     * **Android暂未适配，正常情况下请不要使用这种双端不统一的方法**
     * @deprecated since 10032
     * @param {json} message 以errorCode为key，以错误提示信息为value的字典。key和value的数据类型都须是string。
     * @return boolean 设置是否成功
     * @example
     * let ret = Device.getDeviceWifi().setFirmwareUpdateErrDic({"3":'无法连接'})
     */
    setFirmwareUpdateErrDic(message) {
        //@native :=> promise {}
        if (native.isIOS) {
            native.MIOTHost.setFirmwareUpdateErrDic(message);
            return true
        } else {
            return false
        }
        //@native end
    }
    /**
     * 设置设备控制页不检查固件升级，避免出现弹框，已废弃。
     * **Android暂未适配**
     * @deprecated since 10032 请使用Package.disableAutoCheckUpgrade = true 来屏蔽默认弹窗
     * @param {boolean} notCheck 是否 不检查更新 true-不自动检查 false-自动检查
     * @example
     * Device.getDeviceWifi().setFirmwareNotCheckUpdate(true|false)
     *  .then(res => console.log('success:', res))
     *  .catch(err => console.log('failed:', err))
     * 
     * @return {Promise}  
     *      resolve: "set success"
     *      reject: "not a MHDeviceViewControllerBase"
     */
    setFirmwareNotCheckUpdate(notCheck) {
        //@native :=> promise
        if (native.isAndroid) {
            return new Promise.reject("Android not suppoty yet");
        }
        return new Promise((resolve, reject) => {
            native.MIOTHost.firmwareNotCheckUpdate(notCheck, (ok, res) => {
                if (ok) {
                    resolve(res);
                }
                reject(res);
            });
        });
        //@native end
    }
    /**
     * 检查wifi设备固件升级弹窗。该方法会触发升级弹窗alert提示。
     * 建议使用场景为需要屏蔽默认的插件启动检测的弹窗，自行寻找合适的时机触发该检测机制。
     * 支持wifi设备，combo设备，zigbee设备
     * 不支持单模蓝牙、组设备、虚拟设备、离线设备、分享设备。蓝牙检查升级请使用Service.smarthome.getLatestVersionV2()。
     * @example
     *
     * //首先屏蔽默认弹窗
     * Package.disableAutoCheckUpgrade = true;
     * //....
     * //在合适的时间触发
     * Device.checkFirmwareUpdateAndAlert().then(res => { }).catch(err => { })
     * @returns {Promise}
     *      resolve：res={needUpgradge,force,upgrading，latestVersion} ,其中：needUpgrade:是否需要升级，force：是否需要强制升级，updrading：是否正在升级，latestVersion：最新版本版本号
     *      reject：{code: xxx, message: xxx} 401:设备所有者才可升级  其他code:网络错误/服务端错误
     */
    checkFirmwareUpdateAndAlert() {
        //@native :=> promise {}
        let { device } = _find_device(this.deviceID);
        if (device.isShared || device.isVirtualDevice || !device.isOnline || !this.deviceID) {
            return new Promise.reject({ code: 401, message: 'checkFirmwareUpdate pemission deny, please make sure you are the owner of current device and device is online.' })
        }
        return new Promise((resolve, reject) => {
            let app_level = native.MIOTHost.appVersion || native.MIOTHost.systemInfo.sysVersion;
            let platform = native.isAndroid ? 'android' : 'ios';
            let check_reqs = [{ did: this.deviceID }];
            native.MIOTRPC.standardCall('/v2/device/multi_check_device_version', { app_level, platform, check_reqs }, (ok, res) => {
                if (!ok) {
                    return reject(res);
                }
                let infos = res.list;
                let needUpgrade = false;
                let upgrading = false;
                let latestVersion = '';
                if (!(infos instanceof Array) || infos.length <= 0) {
                    // infos 非数组，不处理
                    return resolve({ needUpgrade: false, force: false, upgrading: false });
                }
                let latest = infos[0]
                if (!latest) {
                    //不升级提示
                    return resolve({ needUpgrade: false, force: false, upgrading: false });
                }
                latestVersion = latest.latest;
                //根据native逻辑，只有需要升级和升级中更需要跳转升级页面
                if (!latest.isLatest && latest.latest !== latest.curr && !latest.updating) {
                    if (latest.ota_status === 'failed') {
                        //更新失败
                    } else {
                        //需要更新
                        needUpgrade = true;
                    }
                } else if (latest.ota_status === 'downloading' || latest.ota_status === 'downloaded' || latest.ota_status === 'installing') {
                    //正在升级安装
                    upgrading = true;
                }
                //内部事件，不需要提供给外部
                DeviceEventEmitter.emit('MH_FirmwareNeedUpdateAlert', { needUpgrade, force: latest.force, upgrading, latestVersion });
                return resolve({ needUpgrade, force: latest.force, upgrading, latestVersion });
            })
        })
        //@native end
    }
    /**
    * 检查当前设备是否支持HomeKit，Android系统不支持HomeKit设备。需要在plato平台配置homekit_config，包含在内的设备，isHomekit才可能返回true
    * @since 10021
    * @returns {Promise<boolean>} 是否支持  res = true or false
    */
    checkIsHomeKitDevice() {
        //@native :=> Promise
        let { device } = _find_device(this.deviceID);
        if (native.isAndroid) {
            return new Promise.reject({ code: -1, message: 'Android not support HomeKit' })
        }
        return new Promise((resolve, reject) => {
            native.MIOTHost.isHomeKitDevice(device.model, (ok, res) => {
                if (ok) {
                    resolve(res);
                } else {
                    reject(res);
                }
            })
        })
        //@native end
    }
    /**
     * 检查当前设备是否已经接入了HomeKit，Android不支持。如果没有接入，可以调用下面的bindToHomeKit方法，将设备接入
     * @since 10021
     * @returns {Promise<boolean>} 是否接入 res = true or false
     */
    checkHomeKitConnected() {
        //@native :=> Promise
        if (native.isAndroid) {
            return new Promise.reject({ code: -1, message: 'Android not support HomeKit' })
        }
        return new Promise((resolve, reject) => {
            native.MIOTHost.isHomeKitConnected(this.deviceID, (ok, res) => {
                if (ok) {
                    resolve(res);
                } else {
                    reject(res);
                }
            })
        })
        //@native end
    }
    /**
     * 将当前设备绑定到HomeKit中
     * 绑定失败部分code：-1:system version 10.0 support hard auth bind or system version 11.3 support soft auth bind
     * @since 10021
     * @returns {Promise} 成功进入then，失败进入catch resolve ：res = true；reject：res={code:xxx,message:xxx}
     *
     */
    bindToHomeKit() {
        //@native :=> Promise
        if (native.isAndroid) {
            return new Promise.reject({ code: -1, message: 'Android not support HomeKit' })
        }
        let { device } = _find_device(this.deviceID);
        return new Promise((resolve, reject) => {
            native.MIOTHost.addToHomeKit(device.deviceID, device.model, (ok, res) => {
                if (ok) {
                    resolve(res);
                } else {
                    reject(res);
                }
            })
        })
        //@native end
    }
    /**
     * @typedef {Object} DeviceExtra
     * @property {string} name 设备名称
     * @property {string} did 设备did
     * @property {string} mac 设备mac地址
     * @property {bool} share_flag 设备是否是分享设备
     *
     */
    /**
     * @typedef {Object} DeviceProductInfo
     * @property {string} model 设备model
     * @property {string} product_name 设备的产品名称
     * @property {string} product_icon 设备图标
     * @property {string} product_id 设备类别id
     * @property {Object<DeviceExtra[]>} devices
     *
     */
    /**
     * 获取当前设备列表中的指定model的设备列表。需要在common_extra_config增加配置，暂时用于秒秒测的互联互通功能。
     * 用途：秒秒测有一个设备互联的功能，比如牙刷可以连电子表，然后电子表上展示倒计时。
     * @since 10003
     * @param {string} model 设备model
     * @returns {Promise<DeviceProductInfo[]>}
     *      resolve：设备列表数组
     *      reject：{message:xxx} 找不到授权的model  无法找到任何设备
     */
    requestAuthorizedDeviceListData(model) {
        //@native :=> Promise
        return new Promise((resolve, reject) => {
            native.MIOTDevice.requestAuthorizedDeviceListData(model, (ok, res) => {
                if (ok) {
                    resolve(res);
                } else {
                    reject(res);
                }
            })
        })
        //@native end
    }
    /**
     * 获取虚拟设备的子设备列表，暂时已上线的虚拟设备有：yeelink和philips灯组。其他的暂不支持。注意：mesh灯组，和灯组2.0，无法通过此接口获取子设备（暂未开放）
     * @since  10003
     * 涉及接口：/home/virtualdevicectr。可抓包此接口查看，返回的为此接口的数据
     * 使用场景：展示灯组设备的子设备列表，可通过此接口获取数据
     * @returns {Promise<BasicDevice[]>}
     *      resolve:子设备列表
     *      reject：{code: xxx, message: xxx}网络错误
     */
    getVirtualDevices() {
        //@native :=> promise []
        let { device } = _find_device(this.deviceID);
        const self = Properties.of(device);
        if (self.parentDevice && Object.keys(self.parentDevice).length > 0) {
            return Promise.reject("当前设备已经是一个子设备，不存在子设备列表");
        }
        if (self._virtualDevices && self._virtualDevices.length > 0) {
            return Promise.resolve(self._virtualDevices);
        }
        return new Promise((resolve, reject) => {
            native.MIOTRPC.nativeCall("/home/virtualdevicectr", { type: "get", masterDid: this.deviceID },
                (ok, res) => {
                    if (ok && res && res.result && res.result.members) {
                        self._virtualDevices = res.result.members.map(stat => {
                            //initDeviceEvents
                            return (Properties.init(new BasicDevice(),
                                { ...stat, _parentDeviceID: this.deviceID, _parentDevice: this, _msgset: null, _is_virtual: true }
                            ));
                        })
                        resolve(self._virtualDevices);
                    } else {
                        reject(res)
                    }
                });
        });
        //@native end
    }
    /**
     * 获取设备定向推荐信息，展示推荐入口使用：用于获取插件上方偶尔弹出的提示条/广告条数据，比如：设备信号差，请调整设备位置。
     * 若需要使用此接口而且不会用，请联系米家的同学。
     * @since 10024
     * @param {String} model
     * @param {String} did
     * @returns {Promise}
     *      resolve:定向推荐数据。米家的同学可通过下面的wiki查询
     *      reject: {code: xxx, message: xxx} -1 获取设备定向推荐数据失败
     */
    getRecommendScenes(model, did) {
        //@native :=> promise {}
        //隐藏此请求的wiki地址：https://wiki.n.miui.com/pages/viewpage.action?pageId=166637359
        return new Promise((resolve, reject) => {
            if (native.isAndroid) {
                native.MIOTDevice.getRecommendScenes(model, did, (ok, res) => {
                    if (ok) {
                        if (typeof res === "string") {
                            // Android返回的是字符串格式
                            res = JSON.parse(res)
                        }
                        resolve(res);
                    } else {
                        reject(res);
                    }
                })
            } else {
                native.MIOTDevice.getRecommendScenes(did, (ok, res) => {
                    if (ok) {
                        resolve(res);
                    } else {
                        reject(res);
                    }
                })
            }
        });
        //@native end
    }
    //@native begin
    updateHomeKitAuthorizationData(data) {
        if (native.isAndroid) {
            return new Promise.reject({ code: -1, message: 'Android not support HomeKit' })
        }
        return new Promise((resolve, reject) => {
            native.MIOTHost.updateHomeKitAuthorizationData(data, (ok, res) => {
                if (ok) {
                    resolve(res)
                } else {
                    reject(res)
                }
            })
        })
    }
    //@native end
}