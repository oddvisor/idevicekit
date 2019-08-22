let EventEmitter = require('events');
let plist = require('plist');
let extend = require('extend');
let fs = require('fs');
let exec = require('./exec');

let _checkSerial = (serial) => {
    return serial.length > 0;
};

const path = require('path');

class iDeviceClient extends EventEmitter {
    constructor() {
        super();
    }

    setLibPath(libPath) {
        this.absolutePath = process.platform == "darwin" ? '' : libPath;
    }

    listDevices() {
        return exec(this.absolutePath + 'idevice_id -l').then((stdout) => {
            let devices = stdout.split('\n');
            let result = [];
            for (let device of devices) {
                device = device.trim();
                if (_checkSerial(device)) {
                    result.push(device);
                }
            }
            return result;
        });
    }

    // ## raw api ##
    getProperties(serial, option) {
        if (!_checkSerial(serial)) return Promise.reject('invalid serial number');
        let result = '';
        let cmd = this.absolutePath + 'ideviceinfo -u ' + serial + ' -x';
        if (option) {
            if (('simple' in option) && (option['simple'])) {
                cmd += ' -s';
            }
            if (('domain' in option) && (option['domain'])) {
                cmd += ' -q ' + option['domain'];
            }
            if (('key' in option) && (option['key'])) {
                cmd += ' -k ' + option['key'];
            }
        }
        return exec(cmd).then((stdout) => {
            try {
                if (stdout) {
                    result = plist.parse(stdout);
                    return result;
                }
            } catch (e) {
                return result;
            }
        });
    }

    getPackages(serial, option) {
        if (!_checkSerial(serial)) return Promise.reject('invalid serial number');
        let defaultOption = {
            'list': 'user'
        };
        defaultOption = extend(true, defaultOption, option);
        let cmd = this.absolutePath + 'ideviceinstaller -u ' + serial + ' -l -o xml';
        if (defaultOption['list'] === 'system') {
            cmd = cmd + ' -o list_system';
        }
        if (defaultOption['list'] === 'all') {
            cmd = cmd + ' -o list_all';
        }
        return exec(cmd).then((stdout) => {
            try {
                let result = [];
                let packages = plist.parse(stdout);
                for (let packageObj of packages) {
                    result.push(packageObj['CFBundleIdentifier']);
                }
                return result;
            } catch (e) {
                throw e;
            }
        });
    }

    install(serial, ipa, option) {
        if (!_checkSerial(serial)) return Promise.reject('invalid serial number');
        if (!fs.existsSync(ipa)) return Promise.reject(`ipa file ${ipa} not exists`);
        let defaultOption = {
            resign: false,
            mobileprovision: './develop.mobileprovision',
            identity: 'iPhone Developer: xxxx (XXXXXXXXXX)',
            keychainPassword: ''
        };
        defaultOption = extend(true, defaultOption, option);
        let resultPromise;
        if (defaultOption.resign) {
            let path = require('path');
            let shell = path.join(__dirname, 'tools', 'r.sh');
            let cmd = 'sh ' + shell + ' "' + ipa + '" "' + defaultOption.mobileprovision + '" "' + defaultOption.identity +
                '" "' + ipa + '" "' + defaultOption.keychainPassword + '"';
            resultPromise = exec(cmd, { timeout: 300000 });
        } else {
            resultPromise = Promise.resolve();
        }
        let cmd = this.absolutePath + 'ideviceinstaller -u ' + serial + ' -i "' + ipa + '"';
        return resultPromise.then(() => {
            return new Promise((resolve, reject) => {
                exec(cmd, { timeout: 300000 }).then((output) => {
                    if (/\sComplete\s/.test(output)) {
                        resolve(output);
                    } else {
                        reject({"message": output});
                    }
                }, (error) => {
                    reject({"message": error});
                });
            })
        });
    }

    uninstall(serial, packageid, option) {
        if (!_checkSerial(serial)) return Promise.reject('invalid serial number');
        let defaultOption = {
            resign: false,
            mobileprovision: './develop.mobileprovision',
            identity: 'iPhone Developer: xxxx (XXXXXXXXXX)',
            keychainPassword: ''
        };
        defaultOption = extend(true, defaultOption, option);
        let resultPromise;
        if (defaultOption.resign) {
            let path = require('path');
            let shell = path.join(__dirname, 'tools', 'r.sh');
            let cmd = 'sh ' + shell + ' "' + ipa + '" "' + defaultOption.mobileprovision + '" "' + defaultOption.identity +
                '" "' + ipa + '" "' + defaultOption.keychainPassword + '"';
            resultPromise = exec(cmd, { timeout: 300000 });
        } else {
            resultPromise = Promise.resolve();
        }
        let cmd = this.absolutePath + 'ideviceinstaller -u ' + serial + ' -U ' + packageid;
        return resultPromise.then(() => {
            return new Promise((resolve, reject) => {
                exec(cmd, { timeout: 300000 }).then((output) => {
                    if (/\sComplete\s/.test(output)) {
                        resolve(output);
                    } else {
                        reject({"message": output});
                    }
                }, (error) => {
                    reject({"message": error});
                });
            })
        });
    }

    reboot(serial) {
        if (!_checkSerial(serial)) return Promise.reject('invalid serial number');
        let cmd = this.absolutePath + 'idevicediagnostics restart -u ' + serial;
        return exec(cmd).then(() => {
            return true;
        });
    }

    shutdown(serial) {
        if (!_checkSerial(serial)) return Promise.reject('invalid serial number');
        let cmd = this.absolutePath + 'idevicediagnostics shutdown -u ' + serial;
        return exec(cmd).then(() => {
            return true;
        });
    }

    name(serial, newName) {
        if (!_checkSerial(serial)) return Promise.reject('invalid serial number');
        if (newName === undefined) {
            newName = '';
        } else {
            newName = '"' + newName.replace(/\"/g, '\\"') + '"';
        }
        let cmd = this.absolutePath + 'idevicename -u ' + serial + ' ' + newName;
        return exec(cmd).then((result) => {
            return result.trim();
        });
    }

    runCommand(cmd) {
        return exec(this.absolutePath + cmd).then((result) => {
            return result;
        }, (error) => {
            throw error;
        });
    }

    activatePhone(serial) {
        if (!_checkSerial(serial)) return Promise.reject('invalid serial number');
        let cmd = this.absolutePath + 'ideviceactivation -u ' + serial + ' activate';
        return exec(cmd).then((result) => {
            return result.toLowerCase().indexOf('success') > -1;
        }, (stdout, stderr) => {
            throw stdout || stderr;
        });
    }

    ganymedeUploadTestInfo(serial, sourcefile) {
        if (!_checkSerial(serial)) return Promise.reject('invalid serial number');
        let cmd = this.absolutePath + 'idevice_ganymedeafc -u ' + serial + ' upload ' + sourcefile;
        return exec(cmd).then((result) => {
            return result.toLowerCase().indexOf('success') > -1;
        }, (error) => {
            throw error;
        });
    }

    ganymedeCheckFile(serial, filename) {
        if (!_checkSerial(serial)) return Promise.reject('invalid serial number');
        let cmd = this.absolutePath + 'idevice_ganymedeafc -u ' + serial + ' list ' + filename;
        return exec(cmd).then((result) => {
            return result.toLowerCase().indexOf('success') > -1;
        }, (error) => {
            throw error;
        });
    }

    ganymedeReadFile(serial, filename, saveDirectory, imei, extension) {
        if (!_checkSerial(serial)) return Promise.reject('invalid serial number');
        let cmd = this.absolutePath + 'idevice_ganymedeafc -u ' + serial + ' read ' + ' ' + filename + ' ' + saveDirectory + ' ' + imei + ' ' + extension;
        return exec(cmd).then((result) => {
            return result.toLowerCase().indexOf('success') > -1;
        }, (error) => {
            throw error;
        });
    }

    ganymedePrepareIphone(serial, zone) {
        if (!_checkSerial(serial)) return Promise.reject('invalid serial number');
        let cmd = this.absolutePath + 'idevice_ganymedeprepare -u ' + serial + ' -z ' + zone;
        return exec(cmd).then((result) => {
            return result.toLowerCase().indexOf('success') > -1;
        }, (error) => {
            throw error;
        });
    }

    getIORegEntryData(serial, ioregEntry) {
        if (!_checkSerial(serial)) return Promise.reject('invalid serial number');
        let cmd = this.absolutePath + 'idevicediagnostics -u ' + serial + ' ioregentry ' + ioregEntry;

        return exec(cmd).then((stdout) => {
            try {
                let result = plist.parse(stdout);
                return result;
            } catch (e) {
                return {};
            }
        }, (error) => {
            return {};
        });
    }

    getMobileGestaltData(serial, gestaltKey) {
        if (!_checkSerial(serial)) return Promise.reject('invalid serial number');
        let cmd = this.absolutePath + 'idevicediagnostics -u ' + serial + ' mobilegestalt ' + gestaltKey;

        return exec(cmd).then((stdout) => {
            try {
                let result = plist.parse(stdout);
                return result;
            } catch (e) {
                return {};
            }
        }, (error) => {
            return {};
        });
    }

    // ## shortcut method ##

    getBasicInformation(serial) {
        return this.getProperties(serial)
            .then((result) => {
                let type = result['ProductType'];
                let map = require('./map.json');
                if (type in map) {
                    return map[type];
                }
                return {};
            });
    }

    getResolution(serial) {
        return this.getProperties(serial, { domain: 'com.apple.mobile.iTunes' })
            .then((result) => {
                let resolution = {
                    width: parseInt(result['ScreenWidth'], 10),
                    height: parseInt(result['ScreenHeight'], 10),
                    scale: parseInt(result['ScreenScaleFactor'], 10)
                };
                let points = {
                    width: Math.floor(resolution.width / resolution.scale),
                    height: Math.floor(resolution.height / resolution.scale)
                };
                if ((resolution.width === 1080) && (resolution.height === 1920)) {
                    // There is some diffences between Physical Pixels and Rendered Pixels
                    // on device iPhone [6,6s,7] plus.
                    points = {
                        width: 414,
                        height: 736
                    };
                }
                resolution.points = points;
                return resolution;
            });
    }

    getStorage(serial) {
        return this.getProperties(serial, { domain: 'com.apple.disk_usage' })
            .then((result) => {
                let disk = result['TotalDiskCapacity'];
                let size = result['TotalDataCapacity'];
                let free = result['TotalDataAvailable'];
                let used = size - free;
                return {
                    disk: disk,
                    size: size,
                    used: used,
                    free: free,
                    free_percent: parseInt(free * 100 / (size + 2), 10) + '%'
                }
            });
    }

    getBattery(serial) {
        return this.getProperties(serial, { domain: 'com.apple.mobile.battery' })
            .then((result) => {
                result['level'] = result['BatteryCurrentCapacity'];
                return result;
            });
    }

    getDeveloperStatus(serial) {
        return this.getProperties(serial, { domain: 'com.apple.xcode.developerdomain' })
            .then((result) => {
                return result['DeveloperStatus'];
            });
    }

    crashreport(serial, appName) {
        let self = this;
        if (!_checkSerial(serial)) return Promise.reject('invalid serial number');
        let createTempCmd = 'mktemp -d';
        return exec(createTempCmd).then((tmpDir) => {
            tmpDir = tmpDir.trim();
            let cmd = self.absolutePath + 'idevicecrashreport -u "${serial}" -e "${tmpDir}"';
            return exec(cmd).then(() => {
                let crashLogRegex = new RegExp(`^${appName}.*\.ips$`);
                let result = {};
                fs.readdirSync(tmpDir).forEach((currentFile) => {
                    let crashLogFileName = crashLogRegex.exec(currentFile);
                    if (crashLogFileName !== null) {
                        result.currentFile = fs.readFileSync(path.join(tmpDir, currentFile), 'utf8');
                    }
                });

                return result;
            });
        });
    }
}

module.exports = new iDeviceClient();