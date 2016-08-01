var bitol = {};
bitol.loadScript = function(url) {
    var script = document.createElement('script');
    script.type = 'application/javascript';
    script.src = url;
    document.body.appendChild(script);
};
bitol.loadDependencies = function(dependencies, main) {
    for (var i = 0; i < dependencies.length; i++) {
        bitol.loadScript(dependencies[i]);
    }
    main();
};
bitol.storage = function(name) {
    var that = {};
    that.contains = function(key) {
        return typeof window.sessionStorage[name + '/' + key] !== 'undefined';
    };
    that.store = function(key, value) {
        window.sessionStorage.setItem(name + '/' + key, JSON.stringify(value));
        return that;
    };
    that.retrieve = function(key) {
        if (that.contains(key)) {
            return JSON.parse(window.sessionStorage.getItem(name + '/' + key));
        }
        throw 'Storage does not contain such key: ' + key;
    };
    that.remove = function(key) {
        if (that.contains(key)) {
            window.sessionStorage.removeItem(name + '/' + key);
            return that;
        }
        throw 'Storage does not contain such key: ' + key;
    };
    that.clear = function() {
        for (var key in window.sessionStorage) {
            if (window.sessionStorage.hasOwnProperty(key) && key.indexOf(name + '/') === 0) {
                window.sessionStorage.removeItem(key);
            }
        }
        return that;
    };
    return that;
};
bitol.consumer = function(options) {
    var that = {},
        drive = bitol.storage('bitol'),
        cache = bitol.storage('bitolCache'),
        uid = null,
        signature = null,
        endpoints = {},
        request = function(options, callback) {
            var xhr = new XMLHttpRequest();
            xhr.open(options.method || 'get', options.url);
            if (options.headers) {
                for (var name in options.headers) {
                    if (options.headers.hasOwnProperty(name) && name.toLowerCase() !== 'content-type') {
                        xhr.setRequestHeader(name, options.headers[name]);
                    }
                }
            }
            xhr.setRequestHeader('content-type', 'application/json;charset=utf8');
            xhr.responseType = options.responseType || 'json';
            xhr.onload = function() {
                var status = xhr.status,
                    response = xhr.response;
                xhr = null;
                if (callback) {
                    callback(status, response);
                }
            };
            xhr.send(options.data ? JSON.stringify(options.data) : null);
        };
    that.getCache = function() {
        return cache;
    };
    that.setUserId = function(userId) {
        uid = userId;
        return that;
    };
    that.setSignatureFunction = function(signatureFunction) {
        if (!signatureFunction || {}.toString().call(signatureFunction) !== '[object Function]') {
            throw 'Signature function must be a function';
        }
        signature = signatureFunction;
        return that;
    };
    that.hasEndpoint = function(name) {
        return endpoints.hasOwnProperty(name);
    };
    that.addEndpoint = function(name, url) {
        if (!name || !url) {
            throw 'Endpoint name and url must be defined';
        }
        endpoints[name] = url;
        return that;
    };
    that.removeEndpoint = function(name) {
        if (!that.hasEndpoint(name)) {
            throw 'Repository does not know about such endpoint: ' + name;
        }
        delete endpoints[name];
        return that;
    };
    that.send = function(url, callback, method, data) {
        var payload = {
            url: url
        };
        if (uid || signature) {
            payload.headers = {};
            if (uid) {
                payload.headers.uid = uid;
            }
            if (signature) {
                payload.headers.signature = signature(payload.url);
            }
        }
        if (method) {
            payload.method = method;
        }
        if (data) {
            payload.data = data;
        }
        request(payload, callback);
        return that;
    };
    that.download = function(url, callback) {
        if (!callback) {
            throw 'Download function requires a callback with the following signature: function (status, base64FileContent)';
        }
        var xhr = new XMLHttpRequest();
        xhr.open('get', url);
        if (url.indexOf('http') !== 0 && (uid || signature)) {
            payload.headers = {};
            if (uid) {
                xhr.setRequestHeader('uid', uid);
            }
            if (signature) {
                xhr.setRequestHeader('signature', signature(url));
            }
            xhr.setRequestHeader('content-type', 'application/json;charset=utf8');
        }
        xhr.responseType = 'blob';
        xhr.onload = function() {
            var status = xhr.status,
                response = xhr.response,
                reader = null;
            xhr = null;
            if (status === 200) {
                reader = new FileReader();
                reader.onload = function() {
                    callback(status, reader.result);
                };
                reader.readAsDataURL(response);
            } else {
                callback(status, null);
            }
        };
        xhr.send();
        return that;
    };
    that.load = function(name, callback) {
        if (!that.hasEndpoint(name)) {
            throw 'Repository does not know about such endpoint: ' + name;
        }
        that.send(endpoints[name], function(status, response) {
            var collection = {};
            for (var i = 0; i < response.length; i++) {
                collection[response[i].id] = response[i];
            }
            drive.store(name, collection);
            if (callback) {
                callback(status, collection);
            }
        });
        return that;
    };
    that.fetch = function(name) {
        if (!that.hasEndpoint(name)) {
            throw 'Repository does not know about such endpoint: ' + name;
        }
        return drive.retrieve(name);
    };
    that.fetchItem = function(name, id, callback) {
        var collection = that.fetch(name);
        return collection.hasOwnProperty(id) ? collection[id] : null;
    };
    that.find = function(name, parameters, callback) {
        var result = [],
            collection = that.fetch(name),
            id, item, property;
        for (id in collection) {
            if (collection.hasOwnProperty(id)) {
                item = collection[id];
                for (property in parameters) {
                    if (item.hasOwnProperty(property) && item[property] === parameters[property]) {
                        result.push(item);
                        break;
                    }
                }
            }
        }
        return result;
    };
    that.search = function(name, pattern, callback) {
        var result = [],
            collection = that.fetch(name),
            id, item, property;
        for (id in collection) {
            if (collection.hasOwnProperty(id)) {
                item = collection[id];
                for (property in item) {
                    if (item.hasOwnProperty(property) && item[property].toString().toLowerCase().indexOf(pattern.toLowerCase()) >= 0) {
                        result.push(item);
                        break;
                    }
                }
            }
        }
        return result;
    };
    that.append = function(name, item, callback) {
        if (!that.hasEndpoint(name)) {
            throw 'Repository does not know about such endpoint: ' + name;
        }
        that.send(endpoints[name], function(status, response) {
            if (status === 201) {
                that.load(name, function() {
                    if (callback) {
                        callback(status, response);
                    }
                });
            } else {
                if (callback) {
                    callback(status, response);
                }
            }
        }, 'post', item);
        return that;
    };
    that.replace = function(name, item, callback) {
        if (!that.hasEndpoint(name)) {
            throw 'Repository does not know about such endpoint: ' + name;
        }
        that.send(endpoints[name] + '/' + item.id, function(status, response) {
            if (status === 200) {
                that.load(name, function() {
                    if (callback) {
                        callback(status, response);
                    }
                });
            } else {
                if (callback) {
                    callback(status, response);
                }
            }
        }, 'put', item);
        return that;
    };
    that.remove = function(name, id, callback) {
        if (!that.hasEndpoint(name)) {
            throw 'Repository does not know about such endpoint: ' + name;
        }
        that.send(endpoints[name] + '/' + id, function(status, response) {
            if (status === 200) {
                that.load(name, function() {
                    if (callback) {
                        callback(status, response);
                    }
                });
            } else {
                if (callback) {
                    if (callback) {
                        callback(status, response);
                    }
                }
            }
        }, 'delete');
        return that;
    };
    window.onbeforeunload = function() {
        drive.clear();
        cache.clear();
        return '';
    };
    return that;
};
