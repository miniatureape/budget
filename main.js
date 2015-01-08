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
        this.filtered_expenses = opts.filtered_expenses;
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
        var html = _.reduce(this.expenses.where({'budget': this.budget.id}), function(memo, expense) {
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
        if (_.isEmpty(this.expenses.where({'budget': this.budget.id}))) {
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
        var val = this.$el.val();
        if ([KEYS.tab, KEYS.enter].indexOf(e.keyCode) == -1) return;
        if (!val) return;


        var amount = Math.ceil(parseFloat(val));
        
        // Special cases until I get some UI in here
        if (amount === 2015) {
            this.budget.destroy();
            this.app.set('current_budget', null);
            this.app.save();
            return;
        }

        if (amount === 666) {
            window.localStorage.clear();
            window.location.reload();
            return;
        }

        var expense = this.collection.create({
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

        var allowance = prompt("How much can you spend this week?", this.model.get('allowance') || '');
        allowance = parseInt(allowance, 10);

        if (_.isNaN(allowance)) {
            allowance = 0;
        }

        var model;

        while (model = this.expenses.where({'budget': this.model.id}).pop()) {
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
    totalTemplate: _.template($('#total-row').html()),

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
            return memo + this.template(data);
        }, '', this);

        if (this.budgets.length) {
            var grand_total = this.budgets.reduce(function(memo, budget) {
                return memo + budget.get('cummulative_total');
            }, 0);

            html += this.totalTemplate({grand_total: grand_total});
        }

        this.$el.html(html);
    }, 

    selectBudget: function(e) {
        var id  = e.currentTarget.id;
        this.app.set('current_budget', id);
        this.app.save();
    },

});

var SelectionView = Backbone.View.extend({

    template: _.template($('#budget-selection').html()),

    events: {
        'click [data-new-budget]': 'createNewBudget',
        'click [data-reset-all]': 'resetAllBudgets'
    },

    initialize: function(opts) {
        this.app = opts.app;
        this.budgets = opts.budgets;
        this.expenses = opts.expenses;
        this.listenTo(this.budgets, 'change', this.render);
    },

    render: function() {

        this.$el.html(this.template({has_budgets: !this.budgets.isEmpty()}));

        var budgetListView = new BudgetListView({
            el: this.$el.find('[data-budget-list-mount]'),
            budgets: this.budgets,
            app: this.app
        });

        budgetListView.render();
    },

    createNewBudget: function() {
        var budgetName = prompt("Name your budget", "Personal");

        if (!budgetName) {
            return;
        }

        var budget = this.budgets.create({name: budgetName});
        budget.save();
        this.app.set('current_budget', budget.id);
        this.app.save();
    },

    resetAllBudgets: function() {

        if (!confirm("Restart week for all budgets?")) {
            return;
        }

        // destroy all expenses
        var model;
        while (model = this.expenses.first()) {
            model.destroy();
        }

        this.budgets.each(function(budget) {
            budget.incrementTotal(budget.get('allowance'));
            budget.save();
        });
        
    },
});

var BudgetView = Backbone.View.extend({

    template: _.template($('#budget').html()),

    events: {
        'click [data-show-selection]': 'showSelection'
    },

    initialize: function(opts) {
        this.app = opts.app;
        this.expenses = opts.expenses;
    },

    showSelection: function() {
        this.app.set('current_budget', null);
        this.app.save();
    },

    render: function() {

        this.$el.html(this.template(this.model.toJSON()));

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
            budget: this.model,
        });

        var expenseForm = new ExpenseForm({
            el: this.$el.find('[data-expense-form]'),
            app: this.app,
            budget: this.model,
            collection: this.expenses,
        });

        var resetView = new ResetView({ 
            el: this.$el.find('[data-reset-mount]'),
            model: this.model,
            expenses: this.expenses,
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
        this.innerView = null;
    },

    render: function() {

        if (this.innerView) {
            this.innerView.undelegateEvents();
        }

        var mountElem = this.$el.find('[data-view-region]');

        var currentBudget = this.model.get('current_budget');

        if (_.isNull(currentBudget)) {

            this.innerView = new SelectionView({
                el: mountElem,
                app: this.model,
                budgets: this.budgets,
                expenses: this.expenses,
            });

        } else {

            var budget = this.budgets.get(currentBudget);
            this.innerView = new BudgetView({
                el: mountElem,
                app: this.model,
                model: budget,
                expenses: this.expenses,
            });

        }

        this.innerView.render();
    }
})

function main() {

    var app = new AppModel({id: 1});
    var expenses = new Expenses();
    var budgets = new Budgets();

    app.fetch();
    expenses.fetch();
    budgets.fetch();

    var appView = new AppView({
        el: $('[data-app]'),
        model: app,
        budgets: budgets,
        expenses: expenses,
    });

    appView.render();

}

main();
