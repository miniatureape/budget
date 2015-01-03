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
        current_budget: null,
        grand_total: 0
    },
    incrementTotal: function(amount) {
        this.set('grand_total', this.get('grand_total') + amount);
    },
});

var Budget = Backbone.Model.extend({
    defaults: { 
        allowance: null,
        cummulative_total: 0,
    },
    incrementTotal: function(amount) {
        this.set('cummulative_total', this.get('cummulative_total') + amount);
    }
});

var Budgets = Backbone.Collection.extend({
    model: Budget,
    localStorage: new Backbone.LocalStorage("Budgets"),
});

var Expense = Backbone.Model.extend({

    defaults: { 
        amount: 0,
        date: null,
        budget: null
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
        this.budget = opts.budget;
        this.listenTo(this.expenses, 'add remove reset sync', this.render);
    },
    events: {
        'click [data-expense-action]': 'remove',
    },
    remove: function(e) {
        if (confirm("Remove this expense?")) {
            var expense = this.expenses.get(e.currentTarget.id);
            this.budget.incrementTotal(expense.get('amount'));
            this.budget.save();
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
                running_total: this.budget.get('allowance') - (expense.get('amount') + memo),
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
        this.budget = opts.budget;
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
            date: (new Date).getTime(),
            budget: this.budget.id
        }).save();

        this.budget.incrementTotal(-amount);
        this.budget.save();

        this.$el.val('');
    }
});

var AllowanceView = Backbone.View.extend({

    initialize: function(opts) {
        this.budget = opts.budget;
        this.listenTo(this.budget, 'sync', this.render);
    },

    render: function() {
        this.$el.html(this.budget.get('allowance'));
    }
});

var ResetView = Backbone.View.extend({

    initialize: function(opts) {
        this.expenses = opts.expenses;
    },

    events: { 'click': 'resetWeek' },

    resetWeek: function() {

        var allowance = prompt("How much can you spend this week?");
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
        this.$el.html(this.model.get('cummulative_total'));
    }
})

var BudgetListView = Backbone.View.extend({

    template: _.template($('#budget-row').html()),

    events: {
        'click [data-select-budget]': 'selectBudget'
    },

    initialize: function(opts) {
        this.budgets = opts.budgets;
        this.app = opts.app;
    },

    render: function() {
        var html = this.budgets.reduce(function(memo, budget) {
            var data = _.extend({id: budget.id}, budget.toJSON());
            return this.template(data);
        }, '', this);
        this.$el.html(html);
    }, 

    selectBudget: function(e) {
        var id  = e.currentTarget.id;
        this.app.set('current_budget', id);
    },

});

var SelectionView = Backbone.View.extend({

    template: _.template($('#budget-selection').html()),

    initialize: function(opts) {
        this.app = opts.app;
        this.budgets = opts.budgets;
    },

    render: function() {

        this.$el.html(this.template());

        var budgetListView = new BudgetListView({
            el: this.$el.find('[data-budget-list-mount]'),
            budgets: this.budgets,
            app: this.app
        });

        budgetListView.render();
    },
});

var BudgetView = Backbone.View.extend({

    template: _.template($('#budget').html()),

    initialize: function(opts) {
        this.app = opts.app;
        this.expenses = opts.expenses;
    },

    render: function() {

        this.$el.html(this.template());

        var expensesView = new ExpensesView({
            el: this.$el.find('[data-expense-list]'),
            budget: this.model,
            expenses: this.expenses,
        });

        var totalView = new TotalView({ 
            el: this.$el.find('[data-running-total-mount]'),
            model: this.model,
        });

        var allowanceView = new AllowanceView({
            el: this.$el.find('[data-allowance-mount]'),
            budget: this.model
        });

        var expenseForm = new ExpenseForm({
            el: this.$el.find('[data-expense-form]'),
            app: this.app,
            budget: this.model,
            collection: this.expenses
        });

        var resetView = new ResetView({ 
            el: this.$el.find('[data-reset-mount]'),
            model: this.model,
            expenses: this.expenses
        });

        expensesView.render();
        totalView.render();
        allowanceView.render();
        expenseForm.render();
        resetView.render();

        if (_.isNull(this.model.get('allowance'))) {
            resetView.resetWeek();
        }

        return this.$el.html();

    },
});

var AppView = Backbone.View.extend({

    initialize: function(opts) {
        this.budgets = opts.budgets;
        this.expenses = opts.expenses;
        this.listenTo(this.model, 'change:current_budget', this.render);
    },

    render: function() {
        this.$el.empty();

        var view, 
            currentBudget = this.model.get('current_budget');

        if (_.isNull(currentBudget)) {

            var view = new SelectionView({
                el: this.$el,
                app: this.model,
                budgets: this.budgets
            });

        } else {
            var budget = this.budgets.get(currentBudget);
            var view = new BudgetView({
                el: this.$el,
                app: this.model,
                model: budget,
                expenses: new Expenses(this.expenses.where({budget: budget.id}))
            });

        }

        view.render();
    }
})

function main() {

    var app = new AppModel({id: 1});
    var expenses = new Expenses();
    var budgets = new Budgets();

    var fetch = app.fetch();
    expenses.fetch();
    var budgetFetch = budgets.fetch();

    /*
    fetch.fail(function() {
        resetView.resetWeek();
    });
    */

    var appView = new AppView({
        el: $('[data-app]'),
        model: app,
        budgets: budgets,
        expenses: expenses,
    });

    budgetFetch.done(function(resp) {
        if (!resp.length) {
            var budgetName = prompt("Name your budget", "Personal");
            var budget = budgets.create({name: budgetName});
            budget.save();
            app.set('current_budget', budget.id);
            app.incrementTotal(budget.get('allowance'));
            app.save();
        }
        appView.render();
    });

}

main();
