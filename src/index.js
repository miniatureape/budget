var $                 = require('jquery-browserify');
var moment            = require('moment');
var Backbone          = require('backbone');

Backbone.localStorage = require('backbone.localstorage');
Backbone.$            = $;

var AppModel = Backbone.Model.extend({
    defaults: { 'allowance': 20 }
});

var Expense = Backbone.Model.extend({
    defaults: { amount: 0 }
});

var Expenses = Backbone.Collection.extend({
    localStorage: new Backbone.LocalStorage("Expenses"),
    model: Expense
});

var Day = Backbone.Model.extend({
    defaults: {
        dayOfWeek: function() {
            return moment().day();
        },
        expenses: function() {
            return new Expenses();
        }
    }
});

var Days = Backbone.Collection.extend({
    localStorage: new Backbone.LocalStorage("Days"),
    model: Day
});

var Week = Backbone.Model.extend({

    defaults: {
        weekNo: function() {
            return moment().isoWeek();
        },
        year: function() {
            return moment().year()
        },
        days: function() {
            return new Days();
        }
    },

});

var Weeks = Backbone.Collection.extend({
    localStorage: new Backbone.LocalStorage("Weeks"),
    model: Week,
    comparator: function(item) {
        return [item.get('year'), item.get('weekNo')]
    },
});

function main() {

}

main();
