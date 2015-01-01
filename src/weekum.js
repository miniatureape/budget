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
        difference: 0,
        allowance: 20,
        grand_total: 0,
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

    initialize: function(opts) {
        this.expenses = opts.expenses;
        this.app = opts.app;
        this.listenTo(this.expenses, 'add remove reset', this.render);
    },

    events: {
        'click tr': 'remove',
    },

    remove: function(e) {
        if (confirm("Remove this expense?")) {
            this.expenses.remove(this.expenses.get(e.currentTarget.id));
        }
    },

    render: function() {
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
    }

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
        
        this.collection.create({
            amount: parseInt(this.$el.val(), 10),
            date: (new Date).getTime()
        }).save();

        this.$el.val('');
    }
});

var AllowanceView = Backbone.View.extend({
    initialize: function(opts) {
        this.app = opts.app;
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
        var allowance = prompt("Weekly Allowance?", this.model.get('allowance'));
        allowance = parseInt(allowance, 10);

        if (_.isNaN(allowance)) {
            return;
        }

        var model;

        while(model = this.expenses.first()) {
            model.destroy();
        }

        this.model.set('allowance', allowance);
    }
});

var TotalView = Backbone.View.extend({
    render: function() {
        this.$el.html(this.model.get('grand_total'));
    }
})

function main() {

    var app = new AppModel();

    var expenses = new Expenses();
    expenses.fetch();

    var expensesView = new ExpensesView({
        el: $('[data-expense-list]'),
        expenses: expenses,
        app: app
    });

    var totalView = new TotalView({ 
        model: app ,
        el: '[data-running-total-mount]'
    });
    totalView.render();

    var allowanceView = new AllowanceView({
        el: $('[data-allowance-mount]'),
        app: app
    });
    allowanceView.render();

    var expenseForm = new ExpenseForm({
        el: $('[data-expense-form]'),
        collection: expenses
    });

    var resetView = new ResetView({ 
        el: '[data-reset-mount]',
        model: app,
        expenses: expenses
    });

    expensesView.render();

}

main();
