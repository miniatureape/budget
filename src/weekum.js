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
    localStorage: new Backbone.LocalStorage("AppModel"),
    defaults: { 
        difference: 0,
        allowance: 150,
        grand_total: 0,
    },
    incrementTotal: function(amount) {
        this.set('grand_total', this.get('grand_total') + amount);
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
    emptyTemplate:  _.template($('#expenses-empty').html()),

    initialize: function(opts) {
        this.expenses = opts.expenses;
        this.app = opts.app;
        this.listenTo(this.expenses, 'add remove reset sync', this.render);
    },

    events: {
        'click [data-expense-action]': 'remove',
    },

    remove: function(e) {
        if (confirm("Remove this expense?")) {
            var expense = this.expenses.get(e.currentTarget.id);
            this.app.incrementTotal(expense.get('amount'));
            this.app.save();
            this.expenses.remove(expense);
        }
    },

    renderEmpty: function() {
        this.$el.html(this.emptyTemplate());
    },

    renderExpenses: function() {
        var parts = [];

        var html = this.expenses.reduce(function(memo, expense) {
            var data = _.extend({}, expense.serializeData(), {
                running_total: this.app.get('allowance') - (expense.get('amount') + memo),
                id: expense.id
            });
            parts.push(this.template(data));

            return memo + expense.get('amount');
        }, 0, this);

        this.$el.html(parts.join(''));
    },

    render: function() {
        if (this.expenses.isEmpty()) {
            this.renderEmpty();
        } else {
            this.renderExpenses();
        }
    }

});

var ExpenseForm = Backbone.View.extend({

    initialize: function(opts) {
        this.collection = opts.collection;
        this.app = opts.app;
    },

    events: {
        keydown: 'handleSubmit'
    },

    handleSubmit: function(e) {
        if ([KEYS.tab, KEYS.enter].indexOf(e.keyCode) == -1) return;
        if (!this.$el.val()) return;

        var amount = Math.ceil(parseFloat(this.$el.val()));
        
        this.collection.create({
            amount: amount,
            date: (new Date).getTime()
        }).save();

        this.app.incrementTotal(-amount);
        this.app.save();

        this.$el.val('');
    }
});

var AllowanceView = Backbone.View.extend({

    initialize: function(opts) {
        this.app = opts.app;
        this.listenTo(this.app, 'sync', this.render);
    },

    render: function() {
        this.$el.html(this.app.get('allowance'));
    }
});

var ResetView = Backbone.View.extend({

    initialize: function(opts) {
        this.expenses = opts.expenses;
    },

    events: { 'click': 'resetWeek' },

    resetWeek: function() {

        var allowance = prompt("How much can you spend this week?", this.model.get('allowance'));
        allowance = parseInt(allowance, 10);

        if (_.isNaN(allowance)) {
            return;
        }

        var model;

        while (model = this.expenses.first()) {
            model.destroy();
        }

        this.model.set('allowance', allowance);
        this.model.incrementTotal(allowance);

        this.model.save();
    }
});

var TotalView = Backbone.View.extend({

    initialize: function(opts) {
        this.expenses = opts.expenses;
        this.listenTo(this.model, 'change sync', this.render);
    },

    render: function() {
        this.$el.html(this.model.get('grand_total'));
    }
})

function main() {

    var app = new AppModel();
    app.id = 1;
    var expenses = new Expenses();

    var expensesView = new ExpensesView({
        el: $('[data-expense-list]'),
        expenses: expenses,
        app: app
    });

    var totalView = new TotalView({ 
        model: app,
        el: '[data-running-total-mount]'
    });

    var allowanceView = new AllowanceView({
        el: $('[data-allowance-mount]'),
        app: app
    });

    var expenseForm = new ExpenseForm({
        el: $('[data-expense-form]'),
        app: app,
        collection: expenses
    });

    var resetView = new ResetView({ 
        el: '[data-reset-mount]',
        model: app,
        expenses: expenses
    });

    var fetch = app.fetch();

    fetch.fail(function() {
        resetView.resetWeek();
    });

    expenses.fetch();

}

main();
