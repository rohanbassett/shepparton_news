(function ($) {
    window.Acme = {};
    Acme.View         = {};
    Acme.Model        = {};
    Acme.Collection   = {};

    $('html').on('click', function(e) {
        $('.pulldown ul').hide();
    });

    Acme.server = {

        create: function(uri, queryParams) {return this.call(uri, queryParams, 'post');},
        request: function(uri, queryParams, datatype){return this.call(uri, queryParams, 'get', datatype);},
        update: function(uri, queryParams) {return this.call(uri, queryParams, 'put');},
        delete: function(uri, queryParams) {return this.call(uri, queryParams, 'delete');},
        call: function(uri, queryParams, type, datatype) {

            if (!window.location.origin) {
                 window.location.origin = window.location.protocol + "//" + window.location.hostname + (window.location.port ? ':' + window.location.port: '');
            }
            type = (typeof type !== 'undefined') ? type : 'get';

            queryParams = (typeof queryParams !== 'undefined') ? queryParams : {};

            // console.log(type + ': ' + window.location.origin + '/api/' + uri);
            // if (Object.keys(queryParams).length > 0 ) console.log(queryParams);
            console.log(_appJsConfig.appHostName + '/api/'+uri);
            return $.ajax({
                url: _appJsConfig.appHostName + '/api/'+uri,
                data: queryParams,
                dataType: datatype || "json",
                type: type
            }).fail(function(r) {
                console.log(r);
                if (r.status == 501 || r.status == 404) console.log(r.responseText);
                if (r.responseJSON) console.log(r.responseJSON);
                console.log(r.responseText);
            });
        },
        callClient: function(uri, queryParams, type) {
            type = (typeof type !== 'undefined') ? type : 'get';
            queryParams = (typeof queryParams !== 'undefined') ? queryParams : '';
            return $.ajax({
                url: window.location.origin + uri,
                data: queryParams,
                dataType: "json",
                type: type
            });
        }
    }

    Acme.listen = function() {};

    Acme.listen.prototype.listener = function(topic, data)
    {
        var keys = Object.keys(data);

        for (var i = 0; i<keys.length; i++) {

            for (var listener in this.listeners) {

                if ( listener === keys[i] ) {

                    this.listeners[listener].call(this, data);

                    break;
                }
            }
        }
    };


    Acme.Model.create = function(config)
    {
        var obj = Object.create(
        Acme._Model.prototype, {'resource': {
                                    'value' : config['url'],
                                    'enumerable': true,
                                },
                                'alias' : {
                                    'value' : config['alias'] || null,
                                    'enumerable': true,
                                },
                                'resource_id': {
                                    'value' : config['resource_id'],
                                    'enumerable': true,
                                },
                                'query' : {
                                    'value': [],
                                    'writable': true,
                                    'enumerable': true,
                                }
                     }
        );
        for (var param in config['this']) {
            obj[param] = config['this'][param];
        }
        obj.messages = {
            'set'   : 'updated',
            'delete': 'deleted',
        };

        if (config['messages']) {
            for (var msg in config['messages']) {
                obj.messages[msg] = config['messages'][msg];
            }
        }

        return obj;
    };



    Acme._Collection = function(model) {
        this.model = model || null;
    };
        Acme._Collection.prototype = Object.create(Acme.listen.prototype);


    Acme._Model = function() {};
        Acme._Model.prototype = Object.create(Acme.listen.prototype);
        Acme._Model.prototype.url = function()
        {
            if (this.resource_id) {
                var scope = this;
                var scopeSplit = this.resource_id.split('.');
                for (var k = 0; k < scopeSplit.length; k++) {
                    scope = scope[scopeSplit[k]];
                    if (scope == undefined) return;
                }
                var resource_id = scope
            }
            var id = resource_id || this.data.id;
            return this.resource + '/' + id + this.buildParams();
        };
        Acme._Model.prototype.buildParams = function()
        {
            var query = '';
            for(var i=0;i<this.query.length; i+=2) {
                if (this.query[i+1] != false ) {
                    query += (i===0) ? '?' : '&';
                    query += this.query[i] + '=' + this.query[i+1];
                }
            }
            return query;
        };
        Acme._Model.prototype.fetch = function(set)
        {
            var self = this;
            var set = (set === void 0) ? true : set;
            return Acme.server.request(self.url())
            .done(function(r) {
                if (set) self.set(r.data);
            });
        };
        Acme._Model.prototype.update = function(data, msg)
        {
            var self = this;

            return Acme.server.update(self.url(), data)
            .done(function(d, status, xhr) {
                if (xhr.status === 200) {
                    self.set(data, msg);

                    var message = self.resource + '/update';

                    console.log(Acme.socket.send(JSON.stringify({action: message, value: self.data.id})));

                }
            });
        };

        Acme._Model.prototype.updater = function()
        {
            var self = this;
            var _url = self.url();

            return function(data, msg) {
                return Acme.server.update(_url, data)
                .done(function(d, status, xhr) {
                    if (xhr.status === 200) {
                        self.set(data, msg);
                    }
                });
            }
        };

        Acme._Model.prototype.set = function(value, msg)
        {
            var suppress = msg || false;
            for (var v in value) {
                this.data[v] = value[v];
            }
            if (!suppress) {
                var resource = {};
                resource[this.resource] = this;
                // Acme.PubSub.publish('state_changed', resource);
                // Acme.PubSub.publish('update_state', resource);
                Acme.PubSub.publish(this.resource + '/' + this.messages.set, this);
            }
        };
        Acme._Model.prototype.delete = function()
        {
            var self = this;
            var name = self.alias || self.resource;
            var msg = name + '/delete';

            console.log(Acme.socket.send(JSON.stringify({action: msg, value: self.data.id})));

            return Acme.server.delete(self.url())
            .done(function(response) {
                if (response.data == true) {
                    self.data = {};
                    var data =  {};
                    data[name] = null;
                    console.log(data);
                    Acme.PubSub.publish('update_state', data);
                }
            });
        };




    Acme.PubSub = {
        topics : {},
        lastUid : -1,
    };

        Acme.PubSub.publisher = function(topic, data) {
            var self = this;
            var Deferred = function() {
                return {
                    done: function(func) {
                        this.func = func;
                    },
                    resolve: function() {
                        if (this.func) {
                            this.func();
                        }
                    }
                }
            };

            if ( !this.topics.hasOwnProperty( topic ) ){
                return false;
            }

            var dfd = Deferred();

            var notify = function(){
                var subscribers = self.topics[topic];
                for ( var i = 0, j = subscribers.length; i < j; i++ ){
                    var scope = window;
                    var scopeSplit = subscribers[i].context.split('.');
                    for (var k = 0; k < scopeSplit.length - 1; k++) {
                        scope = scope[scopeSplit[k]];
                        if (scope == undefined) return;
                    }
                    console.log('notifying');
                    console.log(scope);

                    scope[scopeSplit[scopeSplit.length - 1]][subscribers[i].func]( topic, data );
                }
                dfd.resolve();
            };

            setTimeout( notify , 0 );

            return dfd;
        };

        Acme.PubSub.publish = function( topic, data ){
            return this.publisher( topic, data, false );
        };

        Acme.PubSub.reset = function( ){
            this.lastUid = -1;
        };

        Acme.PubSub.print = function(){
            var subscribers = this.topics;
            for (var sub in subscribers) {
                for ( var i = 0; i < subscribers[sub].length; i++ ) {
                }
            }
        };

        Acme.PubSub.subscribe = function( subscription ) {
            var callbacks = Object.keys(subscription);
            var ret_topics = {};
            console.log(subscription);
            for (var i=0;i<callbacks.length; i++) {
                for(var j=0;j<subscription[callbacks[i]].length;j++) {
                    var topic = subscription[callbacks[i]][j];

                    var context = callbacks[i].substring(0, callbacks[i].lastIndexOf('.'));
                    var func = callbacks[i].substring(callbacks[i].lastIndexOf('.') + 1);
                    if ( !this.topics.hasOwnProperty( topic ) ) {
                        this.topics[topic] = [];
                    }

                   for (var k=0;k<this.topics[topic].length; k++) {
                        if (this.topics[topic][k].context === context && this.topics[topic][k].func === func) {
                            return;
                        }
                    }

                    var token = (++this.lastUid).toString();

                    this.topics[topic].push( { token : token, func : func, context : context } );
                    ret_topics[topic] = this.topics[topic];
                }

            }
            return ret_topics;
        };

        Acme.PubSub.unsubscribe = function( token ){
            for ( var m in this.topics ){
                if ( this.topics.hasOwnProperty( m ) ){
                    for ( var i = 0, j = this.topics[m].length; i < j; i++ ){
                        if ( this.topics[m][i].token === token ){
                            this.topics[m].splice( i, 1 );
                            return token;
                        }
                    }
                }
            }
            return false;
        };










    Acme.listMenu = function(config)
    {
        this.defaultTemp      = Handlebars.compile('<div id="{{ name }}" class="pulldown"><p></p><span></span><ul data-key="{{ key }}" class="articleExtendedData"></ul></div>');
        this.defaultItemTemp  = Handlebars.compile('<li data-value="{{value}}">{{label}}</li>');
        this.menuParent       = config.parent        || {};
        this.template         = config.template      || this.defaultTemp;
        this.itemTemp         = config.itemTemp      || this.defaultItemTemp;
        this.list             = config.list          || [];
        this.defaultSelection = config.defaultSelect || null;
        this.name             = config.name          || null;
        this.key              = config.key           || null;
        this.listContainer    = null;
        this.defaultItem      = null;
        return this;
    };
        Acme.listMenu.prototype.init = function(prepend)
        {
            var prepend = prepend || 'append';
            this.menuParent[prepend]( this.template({"name": this.name, "key":this.key}) );
            this.defaultItem   = $('#' + this.name+' p');
            this.listContainer = $('#' + this.name+' ul');
            this.events();
            if (this.extendedEvents) this.extendedEvents();
            return this;
        };
        Acme.listMenu.prototype.render = function()
        {
            this.listContainer.empty();
            if (this.defaultSelection != null) {
                this.defaultItem.text(this.defaultSelection.label);
            }
            var html = this.createList();
            this.listContainer.append( html );
            this.listElements  = this.listContainer.find('li');
            this.listItemEvents();
            return this;
        };
        Acme.listMenu.prototype.events = function()
        {
            var self = this;
            this.defaultItem.parent().on('click', function(e) {
                e.stopPropagation();
                self.listContainer.toggle();
            });
        };
        Acme.listMenu.prototype.createList = function()
        {
            var itemTemp = this.itemTemp;
            var html = '';

            for (var i=0; i<this.list.length; i++) {
                html += itemTemp({
                    'label'   :  this.list[i].label,
                    'value'   :  this.list[i].value
                });
            }
            return html;
        };
        Acme.listMenu.prototype.select = function(item)
        {
            var menuid = '#' + this.name + ' > p';
            $(menuid).text(item);
            return this;
        };
        Acme.listMenu.prototype.listItemEvents = function()
        {
            var self = this;
            this.listContainer.on('click', function(e) {
                $.each(self.listElements, function(i,e) {
                    $(e).attr('checked', false);
                });

                var elem = $(e.target);
                var value = elem.data('value');
                elem.attr('checked', true);
                var data = {};
                data[self.name] = value;
                Acme.PubSub.publish('update_state', data);
                console.log('update_state', data);
                self.defaultItem.text(elem.text());
                self.defaultSelection.label = elem.text();
                $(self.listContainer).hide(100);
            });
        };
        Acme.listMenu.prototype.remove = function()
        {
            $('#' + this.name).remove();
            return this;
        }
        Acme.listMenu.prototype.clear = function()
        {
            $('#' + this.name).html('');
            return this;
        }
        Acme.listMenu.prototype.empty = function()
        {
            this.listContainer.empty();
            return this;
        }
        Acme.listMenu.prototype.update = function(list)
        {
            this.list = list;
            this.empty();
            this.render();
            return this;
        }
    
}(jQuery));


    


