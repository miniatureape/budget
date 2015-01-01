var $                 = require('jquery-browserify');
var _                 = require('underscore');
var moment            = require('moment');
var Backbone          = require('backbone');

Backbone.LocalStorage = require('backbone.localstorage');
Backbone.$            = $;

var KEYS = {
    tab: 9,
    enter: 13,
};

var AppModel = Backbone.Model.extend({
    defaults: { 
        difference: 0
    }
});

var Expense = Backbone.Model.extend({
    defaults: { 
        amount: 0,
        date: null
    },
    serializeData: function() {
        var json = this.toJSON();
        json.fmt_date = moment(this.get('date')).format('ddd');
        return json;
    }
});

var Expenses = Backbone.Collection.extend({
    localStorage: new Backbone.LocalStorage("Expenses"),
    model: Expense
});

var ExpensesView = Backbone.View.extend({
    template:  _.template($('#expense-row').html()),
    initialize: function() {
        this.listenTo(this.model.get('expenses'), 'add', this.render);
    },
    render: function() {
        var html = this.model.get('expenses').reduce(function(memo, expense) {
            return memo + this.template(expense.serializeData());
        }, "", this);
        this.$el.html(html);
    }
});

var WeekView = Backbone.View.extend({
    template: _.template($('#week-view').html()),
    render: function() {

        var allowance = this.model.get('allowance');
        var spent = this.model.get('expenses').reduce(function(memo, expense) {
            return memo + (expense.get('amount') || 0);
        }, 0);

        var html = this.template({
            allowance: allowance,
            spent: spent,
            difference: allowance - spent,

        });

        this.$el.html(html);
    }
});

var Week = Backbone.Model.extend({
    defaults: function() {
        return {
            expenses: new Expenses(),
            allowance: 20,
        }
    },
    initialize: function() {
        this.get('expenses').fetch();
    },
});

var Weeks = Backbone.Collection.extend({
    localStorage: new Backbone.LocalStorage("Weeks"),
    model: Week,
});

var ExpenseForm = Backbone.View.extend({
    initialize: function(opts) {
        this.collection = opts.collection
    },
    events: {
        keydown: 'handleSubmit'
    },
    handleSubmit: function(e) {
        if ([KEYS.tab, KEYS.enter].indexOf(e.keyCode) == -1) return;
        if (!this.$el.val()) return;

        e.preventDefault();
        
        this.collection.create({
            amount: parseInt(this.$el.val(), 10),
            date: (new Date).getTime()
        }).save();

        this.$el.val('');
    }
});

function main() {

    var weeks = new Weeks();
    weeks.fetch();

    if (weeks.isEmpty()) {
        weeks.add(new Week());
    }

    var week = weeks.first();

    var weekView = new WeekView({
        el: $('[data-week-view-mount]'),
        model: week
    });

    var expensesView = new ExpensesView({
        el: $('[data-expense-list]'),
        model: week
    });

    var expenseForm = new ExpenseForm({
        el: $('[data-expense-form]'),
        collection: week.get('expenses')
    });

    expensesView.render();
    weekView.render();

}

main();
